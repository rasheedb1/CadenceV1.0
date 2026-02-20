import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCadence } from '@/contexts/CadenceContext'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { useTestStep } from '@/hooks/useLinkedInActions'
import { supabase } from '@/integrations/supabase/client'
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
  ClipboardList,
  AlertTriangle,
  Upload,
  Zap,
  Brain,
  Clock,
  RefreshCw,
  Lock,
} from 'lucide-react'
import { STEP_TYPE_CONFIG, type StepType, type CadenceStep, type Lead } from '@/types'
import type { AIPrompt } from '@/lib/edge-functions'
import { CreateLeadDialog } from '@/components/CreateLeadDialog'
import { ImportLeadsDialog } from '@/components/ImportLeadsDialog'
import { StartAutomationDialog } from '@/components/StartAutomationDialog'
import { FeatureGate } from '@/components/FeatureGate'

// Variable buttons for message templates
const VARIABLES = [
  { name: '{{first_name}}', label: 'First Name' },
  { name: '{{last_name}}', label: 'Last Name' },
  { name: '{{company}}', label: 'Company' },
  { name: '{{title}}', label: 'Title' },
  { name: '{{email}}', label: 'Email' },
  { name: '{{linkedin_url}}', label: 'LinkedIn URL' },
  { name: '{{industry}}', label: 'Industry' },
  { name: '{{website}}', label: 'Website' },
  { name: '{{department}}', label: 'Department' },
  { name: '{{annual_revenue}}', label: 'Annual Revenue' },
]

// Step icons mapping
const STEP_ICONS: Record<StepType, React.ComponentType<{ className?: string }>> = {
  linkedin_message: MessageSquare,
  linkedin_connect: UserPlus,
  linkedin_like: ThumbsUp,
  linkedin_comment: MessageCircle,
  send_email: Mail,
  whatsapp: Phone,
  cold_call: PhoneCall,
  task: ClipboardList,
}

export function CadenceBuilder() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { orgId } = useOrg()
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
  } = useCadence()
  const testStepMutation = useTestStep()

  const cadence = cadences.find((c) => c.id === id)
  const steps = cadence?.steps || []

  // Query cadence_leads directly to avoid the CadenceContext flattening bug
  // (CadenceContext only keeps the first cadence_leads entry per lead,
  //  so leads in multiple cadences are invisible in all but the first)
  const { data: cadenceLeadRecords = [], refetch: refetchCadenceLeads } = useQuery({
    queryKey: ['cadence-leads-direct', id, orgId],
    queryFn: async () => {
      if (!id || !user || !orgId) return []
      const { data } = await supabase
        .from('cadence_leads')
        .select('lead_id, status, current_step_id')
        .eq('cadence_id', id)
        .eq('org_id', orgId!)
      return data || []
    },
    enabled: !!id && !!user && !!orgId,
  })

  const cadenceLeads = leads
    .filter((l) => {
      const clRecord = cadenceLeadRecords.find((cl) => cl.lead_id === l.id)
      return clRecord && ['active', 'scheduled', 'paused', 'generated', 'sent'].includes(clRecord.status)
    })
    .map((l) => {
      const clRecord = cadenceLeadRecords.find((cl) => cl.lead_id === l.id)!
      return { ...l, cadence_id: id, status: clRecord.status, current_step_id: clRecord.current_step_id } as Lead
    })

  // Query AI prompts for automation config
  const { data: aiPrompts = [] } = useQuery({
    queryKey: ['ai-prompts', orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return []
      const { data, error } = await supabase
        .from('ai_prompts')
        .select('*')
        .eq('org_id', orgId!)
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as AIPrompt[]
    },
    enabled: !!user && !!orgId,
  })

  // Query example sections for automation config
  const { data: exampleSections = [] } = useQuery({
    queryKey: ['example-sections-cadence', orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return []
      const { data, error } = await supabase
        .from('example_sections')
        .select('*')
        .eq('org_id', orgId!)
        .order('name', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!user && !!orgId,
  })

  // Query schedules (queue) for this cadence
  const { data: schedules = [], refetch: refetchSchedules } = useQuery({
    queryKey: ['cadence-schedules', id],
    queryFn: async () => {
      if (!id) return []
      const { data, error } = await supabase
        .from('schedules')
        .select(`
          id, cadence_id, cadence_step_id, lead_id, owner_id,
          scheduled_at, timezone, status, message_template_text,
          message_rendered_text, last_error, created_at, updated_at
        `)
        .eq('cadence_id', id)
        .order('scheduled_at', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!id,
    refetchInterval: 30000, // Auto-refresh every 30s
  })

  // Cancel a single schedule
  const cancelSchedule = async (scheduleId: string) => {
    const { error } = await supabase
      .from('schedules')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('id', scheduleId)
      .eq('status', 'scheduled')
    if (!error) {
      toast.success('Envio cancelado')
      refetchSchedules()
    } else {
      toast.error('Error al cancelar')
    }
  }

  // Cancel all scheduled items for this cadence
  const cancelAllScheduled = async () => {
    if (!id) return
    const { error } = await supabase
      .from('schedules')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('cadence_id', id)
      .eq('status', 'scheduled')
    if (!error) {
      toast.success('Todos los envios programados fueron cancelados')
      refetchSchedules()
    } else {
      toast.error('Error al cancelar')
    }
  }

  // State for Start Automation dialog
  const [isAutomationOpen, setIsAutomationOpen] = useState(false)

  // State for add step dialog
  const [isAddStepOpen, setIsAddStepOpen] = useState(false)
  const [newStep, setNewStep] = useState<{
    step_type: StepType
    step_label: string
    day_offset: number
    message_template: string
    template_id: string
    ai_prompt_id: string
    ai_research_prompt_id: string
    ai_example_section_id: string
  }>({
    step_type: 'linkedin_message',
    step_label: '',
    day_offset: 0,
    message_template: '',
    template_id: '',
    ai_prompt_id: '',
    ai_research_prompt_id: '',
    ai_example_section_id: '',
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

  // State for assigning unassigned leads
  const [assigningLeadId, setAssigningLeadId] = useState<string | null>(null)

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
      ai_prompt_id: '',
      ai_research_prompt_id: '',
      ai_example_section_id: '',
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
      .replace(/\{\{linkedin_url\}\}/g, lead.linkedin_url || '')
      .replace(/\{\{industry\}\}/g, lead.industry || '')
      .replace(/\{\{website\}\}/g, lead.website || '')
      .replace(/\{\{department\}\}/g, lead.department || '')
      .replace(/\{\{annual_revenue\}\}/g, lead.annual_revenue || '')
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
          ai_prompt_id: newStep.ai_prompt_id && newStep.ai_prompt_id !== 'none' ? newStep.ai_prompt_id : null,
          ai_research_prompt_id: newStep.ai_research_prompt_id && newStep.ai_research_prompt_id !== 'none' ? newStep.ai_research_prompt_id : null,
          ai_example_section_id: newStep.ai_example_section_id && newStep.ai_example_section_id !== 'none' ? newStep.ai_example_section_id : null,
        },
      })

      setIsAddStepOpen(false)
      setNewStep({
        step_type: 'linkedin_message',
        step_label: '',
        day_offset: 0,
        message_template: '',
        template_id: '',
        ai_prompt_id: '',
        ai_research_prompt_id: '',
        ai_example_section_id: '',
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

  // Assign an unassigned lead to a step
  const handleAssignLeadToStep = async (lead: Lead, stepId: string) => {
    setAssigningLeadId(lead.id)
    try {
      // Update cadence_leads to set current_step_id
      const { error } = await supabase
        .from('cadence_leads')
        .update({ current_step_id: stepId, status: 'active', updated_at: new Date().toISOString() })
        .eq('lead_id', lead.id)
        .eq('cadence_id', id)
      if (error) throw error

      // Create lead_step_instance for tracking (upsert to avoid duplicate key)
      await supabase.from('lead_step_instances').upsert({
        cadence_id: id,
        cadence_step_id: stepId,
        lead_id: lead.id,
        owner_id: user?.id,
        org_id: orgId!,
        status: 'pending',
      }, { onConflict: 'cadence_step_id,lead_id' })

      toast.success(`${lead.first_name} asignado al step`)
      // Refresh data without full page reload
      refetchCadenceLeads()
    } catch (error) {
      console.error('Error assigning lead:', error)
      toast.error('Error al asignar lead')
    } finally {
      setAssigningLeadId(null)
    }
  }

  // Calculate cadence current day based on UTC calendar days since creation
  // Day advances at midnight UTC (00:00 UTC), not after 24h from creation
  const cadenceCurrentDay = (() => {
    if (!cadence?.created_at) return 0
    const createdAt = new Date(cadence.created_at)
    const now = new Date()
    // Get UTC date components (year, month, day) for both dates
    const createdUTC = Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), createdAt.getUTCDate())
    const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    return Math.max(0, Math.floor((nowUTC - createdUTC) / (1000 * 60 * 60 * 24)))
  })()

  // Check if a step's day is available (has arrived)
  const isDayAvailable = (dayOffset: number) => {
    return dayOffset <= cadenceCurrentDay
  }

  // Check if lead can execute step based on day
  const canExecuteStep = (_lead: Lead, step: CadenceStep) => {
    if (isEditMode) return true // Edit mode bypasses day restrictions
    return isDayAvailable(step.day_offset)
  }

  const getRequiredFieldsForStepType = (stepType: StepType): string[] => {
    switch (stepType) {
      case 'linkedin_message':
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
            <h1 className="text-[28px] font-bold tracking-tight font-heading">{cadence.name}</h1>
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
          <div className="flex flex-wrap gap-2 shrink-0">
            <FeatureGate flag="cadence_import_leads">
              <Button variant="outline" size="sm" onClick={() => setIsImportLeadsOpen(true)}>
                <Upload className="mr-1.5 h-4 w-4" />
                Import
              </Button>
            </FeatureGate>
            <Button variant="outline" size="sm" onClick={() => setIsAddLeadOpen(true)}>
              <Users className="mr-1.5 h-4 w-4" />
              Add Lead
            </Button>
            <Button
              variant={isEditMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsEditMode(!isEditMode)}
            >
              <Settings className="mr-1.5 h-4 w-4" />
              {isEditMode ? 'Exit Edit' : 'Edit'}
            </Button>
            <FeatureGate flag="cadence_automate">
              <Button
                size="sm"
                onClick={() => setIsAutomationOpen(true)}
                disabled={steps.length === 0}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white"
              >
                <Zap className="mr-1.5 h-4 w-4" />
                Automate
              </Button>
            </FeatureGate>
            {cadence.status === 'draft' ? (
              <Button size="sm" onClick={handleActivate} disabled={steps.length === 0}>
                Activate
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={handleDeactivate}>
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
          <TabsTrigger value="queue">
            <Clock className="h-4 w-4 mr-1" />
            Queue ({schedules.length})
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
                      {sortedDays.map((day) => {
                        const dayAvailable = isDayAvailable(day)
                        return (
                        <div key={day}>
                          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            Day {day}
                            {day === cadenceCurrentDay && (
                              <Badge variant="default" className="text-xs">Today</Badge>
                            )}
                            {!dayAvailable && (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <Lock className="h-3 w-3" />
                                Available in {day - cadenceCurrentDay}d
                              </Badge>
                            )}
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
                                    className={`rounded-lg border p-4 transition-colors ${
                                      !dayAvailable ? 'opacity-50' : ''
                                    } ${leadsAtStep.length > 0 && dayAvailable ? 'cursor-pointer hover:border-primary hover:bg-muted/50' : ''}`}
                                    onClick={() => {
                                      if (leadsAtStep.length > 0 && dayAvailable) {
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
                                          {!!(stepConfig as Record<string, unknown>)?.ai_prompt_id && (
                                            <Badge variant="outline" className="text-xs border-violet-300 text-violet-600">
                                              <Brain className="mr-1 h-3 w-3" />
                                              AI
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
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Execution Order</CardTitle>
                  <CardDescription>
                    Current day: <strong>Day {cadenceCurrentDay}</strong>
                  </CardDescription>
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
                            <li key={step.id} className={`flex items-center gap-2 text-sm ${!isDayAvailable(day) ? 'opacity-40' : ''}`}>
                              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${isDayAvailable(day) ? 'bg-secondary' : 'bg-muted'}`}>
                                {isDayAvailable(day) ? (
                                  sortedDays
                                    .slice(0, sortedDays.indexOf(day))
                                    .reduce((acc, d) => acc + stepsByDay[d].length, 0) +
                                    index +
                                    1
                                ) : (
                                  <Lock className="h-3 w-3" />
                                )}
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
                            <div className="flex items-center gap-2">
                              <Select
                                onValueChange={(stepId) => handleAssignLeadToStep(lead, stepId)}
                                disabled={assigningLeadId === lead.id}
                              >
                                <SelectTrigger className="w-44 h-8 text-xs">
                                  <SelectValue placeholder="Asignar a step..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {sortedDays.flatMap((day) =>
                                    stepsByDay[day]
                                      .sort((a, b) => a.order_in_day - b.order_in_day)
                                      .map((step) => (
                                        <SelectItem key={step.id} value={step.id}>
                                          Day {step.day_offset}: {step.step_label}
                                        </SelectItem>
                                      ))
                                  )}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setTakeOutConfirmLead(lead)}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Remove
                              </Button>
                            </div>
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

                        const stepDayAvailable = isDayAvailable(step.day_offset)

                        return (
                          <div key={step.id} className={!stepDayAvailable ? 'opacity-50' : ''}>
                            <div className="mb-4 flex items-center justify-between">
                              <h3 className="flex items-center gap-2 font-medium">
                                <Icon className="h-4 w-4" />
                                Day {step.day_offset}: {step.step_label} ({leadsAtStep.length})
                                {!stepDayAvailable && (
                                  <Badge variant="secondary" className="text-xs gap-1">
                                    <Lock className="h-3 w-3" />
                                    Available in {step.day_offset - cadenceCurrentDay}d
                                  </Badge>
                                )}
                              </h3>
                              <FeatureGate flag="cadence_manual_execute">
                                <Button
                                  size="sm"
                                  onClick={() => handleExecuteAllForStep(step)}
                                  disabled={sendingAll || !stepDayAvailable}
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
                              </FeatureGate>
                            </div>
                            <div className="space-y-3">
                              {leadsAtStep.map((lead) => {
                                const canExecute = canExecuteStep(lead, step)
                                const messageTemplate =
                                  leadMessages[lead.id] ||
                                  (stepConfig?.message_template as string) ||
                                  ''

                                return (
                                  <div
                                    key={lead.id}
                                    className="rounded-lg border p-4"
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <p className="font-medium">
                                            {lead.first_name} {lead.last_name}
                                          </p>
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
                                        <FeatureGate flag="cadence_manual_execute">
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
                                        </FeatureGate>
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

        {/* Queue / Execution Status tab */}
        <TabsContent value="queue">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Cola de Ejecucion</CardTitle>
                <CardDescription>Estado de envio de cada mensaje programado</CardDescription>
              </div>
              <div className="flex gap-2">
                {schedules.some((s) => s.status === 'scheduled') && (
                  <Button variant="destructive" size="sm" onClick={cancelAllScheduled}>
                    <XCircle className="h-4 w-4 mr-1" />
                    Cancelar todos
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => refetchSchedules()}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {schedules.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No hay envios programados. Inicia una automatizacion para ver la cola de ejecucion.
                </p>
              ) : (
                <div className="space-y-2">
                  {/* Summary stats */}
                  <div className="flex gap-3 mb-4 flex-wrap">
                    {(() => {
                      const counts = schedules.reduce((acc, s) => {
                        acc[s.status] = (acc[s.status] || 0) + 1
                        return acc
                      }, {} as Record<string, number>)
                      return (
                        <>
                          {counts.scheduled && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200">
                              <Clock className="h-3 w-3 mr-1" /> Programados: {counts.scheduled}
                            </Badge>
                          )}
                          {counts.executed && (
                            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200">
                              <CheckCircle className="h-3 w-3 mr-1" /> Enviados: {counts.executed}
                            </Badge>
                          )}
                          {counts.failed && (
                            <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200">
                              <XCircle className="h-3 w-3 mr-1" /> Fallidos: {counts.failed}
                            </Badge>
                          )}
                          {counts.canceled && (
                            <Badge variant="outline" className="bg-gray-50 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300 border-gray-200">
                              Cancelados: {counts.canceled}
                            </Badge>
                          )}
                        </>
                      )
                    })()}
                  </div>

                  {/* Schedule items */}
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="text-left px-3 py-2 font-medium">Lead</th>
                          <th className="text-left px-3 py-2 font-medium">Step</th>
                          <th className="text-left px-3 py-2 font-medium">Programado</th>
                          <th className="text-left px-3 py-2 font-medium">Estado</th>
                          <th className="text-left px-3 py-2 font-medium">Detalle</th>
                          <th className="text-left px-3 py-2 font-medium w-20"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedules.map((schedule) => {
                          const lead = leads.find((l) => l.id === schedule.lead_id)
                          const step = steps.find((s) => s.id === schedule.cadence_step_id)
                          const StepIcon = step ? STEP_ICONS[step.step_type] : Clock

                          const statusConfig: Record<string, { label: string; className: string }> = {
                            scheduled: { label: 'Programado', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
                            executed: { label: 'Enviado', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
                            failed: { label: 'Fallido', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
                            canceled: { label: 'Cancelado', className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300' },
                            skipped_due_to_state_change: { label: 'Omitido', className: 'bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400' },
                          }
                          const sc = statusConfig[schedule.status] || { label: schedule.status, className: 'bg-gray-100 text-gray-800' }

                          // Format scheduled_at in cadence timezone or local
                          const scheduledDate = new Date(schedule.scheduled_at)
                          const tz = cadence?.timezone || 'America/Mexico_City'
                          let formattedTime = ''
                          try {
                            formattedTime = scheduledDate.toLocaleString('es-MX', {
                              timeZone: tz,
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            })
                          } catch {
                            formattedTime = scheduledDate.toLocaleString()
                          }

                          // Time until scheduled
                          const now = new Date()
                          const diffMs = scheduledDate.getTime() - now.getTime()
                          const isInFuture = diffMs > 0
                          const diffMin = Math.abs(Math.round(diffMs / 60000))
                          let timeLabel = ''
                          if (schedule.status === 'scheduled') {
                            if (isInFuture) {
                              if (diffMin < 60) timeLabel = `en ${diffMin}m`
                              else if (diffMin < 1440) timeLabel = `en ${Math.round(diffMin / 60)}h`
                              else timeLabel = `en ${Math.round(diffMin / 1440)}d`
                            } else {
                              timeLabel = 'pendiente de procesamiento'
                            }
                          }

                          return (
                            <tr key={schedule.id} className="border-b last:border-b-0 hover:bg-muted/30">
                              <td className="px-3 py-2">
                                <div>
                                  <span className="font-medium">
                                    {lead ? `${lead.first_name} ${lead.last_name}` : schedule.lead_id.slice(0, 8)}
                                  </span>
                                  {lead?.company && (
                                    <span className="text-muted-foreground ml-1 text-xs">({lead.company})</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1">
                                  <StepIcon className="h-4 w-4 text-muted-foreground" />
                                  <span>{step ? `Day ${step.day_offset}: ${step.step_label}` : 'Unknown'}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <div>
                                  <span>{formattedTime}</span>
                                  {timeLabel && (
                                    <span className="text-muted-foreground text-xs ml-1">({timeLabel})</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <Badge className={`${sc.className} text-xs`}>{sc.label}</Badge>
                              </td>
                              <td className="px-3 py-2 max-w-[200px]">
                                {schedule.last_error && (
                                  <span className="text-xs text-red-600 dark:text-red-400 truncate block" title={schedule.last_error}>
                                    {schedule.last_error.length > 60 ? schedule.last_error.slice(0, 60) + '...' : schedule.last_error}
                                  </span>
                                )}
                                {schedule.status === 'executed' && schedule.updated_at && (
                                  <span className="text-xs text-green-600 dark:text-green-400">
                                    Enviado {new Date(schedule.updated_at).toLocaleString('es-MX', {
                                      timeZone: tz,
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: true,
                                    })}
                                  </span>
                                )}
                                {schedule.message_rendered_text && (
                                  <span className="text-xs text-muted-foreground truncate block mt-0.5" title={schedule.message_rendered_text}>
                                    {schedule.message_rendered_text.slice(0, 50)}...
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {schedule.status === 'scheduled' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                    onClick={() => cancelSchedule(schedule.id)}
                                  >
                                    Cancelar
                                  </Button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Step Dialog */}
      <Dialog open={isAddStepOpen} onOpenChange={setIsAddStepOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Step</DialogTitle>
            <DialogDescription>Configure a new step for your cadence</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-1">
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

            {/* AI Prompt configuration for automation */}
            <div className="space-y-3 rounded-lg border border-dashed border-violet-300 bg-violet-50/50 dark:bg-violet-950/20 dark:border-violet-800 p-4">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-violet-600" />
                <Label className="text-sm font-medium">AI Prompt (para automatizacion)</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Selecciona un AI prompt para generar mensajes automaticamente cuando se ejecute este step en modo automatizado.
              </p>
              <div className="space-y-2">
                <Label className="text-xs">Message Prompt</Label>
                <Select
                  value={newStep.ai_prompt_id || 'none'}
                  onValueChange={(value) =>
                    setNewStep((prev) => ({ ...prev, ai_prompt_id: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar prompt..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin AI prompt</SelectItem>
                    {aiPrompts
                      .filter((p) => p.prompt_type === 'message' && (p.step_type === newStep.step_type || p.step_type === null))
                      .map((prompt) => (
                        <SelectItem key={prompt.id} value={prompt.id}>
                          {prompt.name}
                          {prompt.is_default && ' (default)'}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Research Prompt (opcional)</Label>
                <Select
                  value={newStep.ai_research_prompt_id || 'none'}
                  onValueChange={(value) =>
                    setNewStep((prev) => ({ ...prev, ai_research_prompt_id: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar research prompt..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin research prompt</SelectItem>
                    {aiPrompts
                      .filter((p) => p.prompt_type === 'research')
                      .map((prompt) => (
                        <SelectItem key={prompt.id} value={prompt.id}>
                          {prompt.name}
                          {prompt.is_default && ' (default)'}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Example Section (opcional)</Label>
                <Select
                  value={newStep.ai_example_section_id || 'none'}
                  onValueChange={(value) =>
                    setNewStep((prev) => ({ ...prev, ai_example_section_id: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar ejemplos..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin ejemplos</SelectItem>
                    {exampleSections.map((section: { id: string; name: string }) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
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

      {/* Start Automation Dialog */}
      {cadence && (
        <StartAutomationDialog
          open={isAutomationOpen}
          onOpenChange={setIsAutomationOpen}
          cadence={cadence}
          steps={steps}
          aiPrompts={aiPrompts}
        />
      )}
    </div>
  )
}
