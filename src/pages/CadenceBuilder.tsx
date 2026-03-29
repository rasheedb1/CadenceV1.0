import { useState, useEffect, useRef, useMemo } from 'react'
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
  Building2,
  ChevronRight,
  ExternalLink,
  Reply,
  Eye,
  Pencil,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { STEP_TYPE_CONFIG, type StepType, type CadenceStep, type Lead, type Schedule } from '@/types'
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
  linkedin_profile_view: Eye,
  send_email: Mail,
  email_reply: Reply,
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
    assignLeadToCadence,
  } = useCadence()
  const testStepMutation = useTestStep()

  const cadence = cadences.find((c) => c.id === id)
  const steps = cadence?.steps || []

  // Query cadence_leads directly to avoid the CadenceContext flattening bug
  // (CadenceContext only keeps the first cadence_leads entry per lead,
  //  so leads in multiple cadences are invisible in all but the first)
  const { data: cadenceLeadRecords = [], refetch: refetchCadenceLeads } = useQuery({
    queryKey: ['cadence-leads-direct', id, orgId, user?.id],
    queryFn: async () => {
      if (!id || !user || !orgId) return []
      const { data } = await supabase
        .from('cadence_leads')
        .select('lead_id, status, current_step_id')
        .eq('cadence_id', id)
        .eq('org_id', orgId!)
        .eq('owner_id', user.id)
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
    queryKey: ['ai-prompts', orgId, user?.id],
    queryFn: async () => {
      if (!user?.id || !orgId) return []
      const { data, error } = await supabase
        .from('ai_prompts')
        .select('*')
        .eq('org_id', orgId!)
        .eq('owner_id', user.id)
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as AIPrompt[]
    },
    enabled: !!user && !!orgId,
  })

  // Query example sections for automation config
  const { data: exampleSections = [] } = useQuery({
    queryKey: ['example-sections-cadence', orgId, user?.id],
    queryFn: async () => {
      if (!user?.id || !orgId) return []
      const { data, error } = await supabase
        .from('example_sections')
        .select('*')
        .eq('org_id', orgId!)
        .eq('owner_id', user.id)
        .order('name', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!user && !!orgId,
  })

  // Query schedules (queue) for this cadence — paginated to bypass Supabase max_rows=1000
  const { data: schedules = [], refetch: refetchSchedules } = useQuery({
    queryKey: ['cadence-schedules', id],
    queryFn: async () => {
      if (!id) return []
      const PAGE_SIZE = 1000
      const MAX_ROWS = 10000
      const allData: Schedule[] = []
      let from = 0
      while (allData.length < MAX_ROWS) {
        const { data, error } = await supabase
          .from('schedules')
          .select(`
            id, cadence_id, cadence_step_id, lead_id, owner_id, org_id,
            scheduled_at, timezone, status, message_template_text,
            message_rendered_text, last_error, created_at, updated_at
          `)
          .eq('cadence_id', id)
          .order('scheduled_at', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        allData.push(...data)
        if (data.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
      return allData
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

  // Retry failed schedules, optionally filtered by step type
  const retryFailed = async (stepType?: StepType) => {
    if (!id) return

    // If filtering by step type, find the cadence_step_ids that match
    let stepIds: string[] | undefined
    if (stepType) {
      stepIds = steps.filter(s => s.step_type === stepType).map(s => s.id)
      if (stepIds.length === 0) return
    }

    let query = supabase
      .from('schedules')
      .update({
        status: 'scheduled',
        scheduled_at: new Date(Date.now() + 60_000).toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('cadence_id', id)
      .eq('status', 'failed')

    if (stepIds) {
      query = query.in('cadence_step_id', stepIds)
    }

    const { data, error } = await query.select('id')
    if (error) {
      toast.error('Error al reintentar')
    } else {
      const count = data?.length || 0
      const label = stepType
        ? STEP_TYPE_CONFIG[stepType]?.label || stepType
        : 'todos'
      toast.success(`${count} fallido${count !== 1 ? 's' : ''} (${label}) se reintentarán en ~1 minuto`)
      refetchSchedules()
    }
  }

  // Compute failed counts per step type for the retry dropdown
  const failedByStepType = useMemo(() => {
    const counts = new Map<StepType, number>()
    for (const schedule of schedules) {
      if (schedule.status !== 'failed') continue
      const step = steps.find(s => s.id === schedule.cadence_step_id)
      if (!step) continue
      counts.set(step.step_type, (counts.get(step.step_type) || 0) + 1)
    }
    return counts
  }, [schedules, steps])

  // ── Lead selection + bulk ops ─────────────────────────────────────────────
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set())
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false)
  const [moveTargetCadenceId, setMoveTargetCadenceId] = useState('')
  const [isMoving, setIsMoving] = useState(false)
  const [showDuplicatesMode, setShowDuplicatesMode] = useState(false)

  // Duplicate detection: group by email OR full name
  const { duplicateLeadIds, duplicatesToRemoveIds } = useMemo(() => {
    const emailGroups = new Map<string, string[]>()
    const nameGroups = new Map<string, string[]>()
    for (const lead of cadenceLeads) {
      if (lead.email?.trim()) {
        const key = lead.email.toLowerCase().trim()
        emailGroups.set(key, [...(emailGroups.get(key) || []), lead.id])
      }
      const name = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.toLowerCase().trim()
      if (name) nameGroups.set(name, [...(nameGroups.get(name) || []), lead.id])
    }
    const allDupes = new Set<string>()
    const toRemove = new Set<string>()
    for (const ids of [...emailGroups.values(), ...nameGroups.values()]) {
      if (ids.length > 1) {
        ids.forEach(i => allDupes.add(i))
        ids.slice(1).forEach(i => toRemove.add(i))
      }
    }
    return { duplicateLeadIds: allDupes, duplicatesToRemoveIds: toRemove }
  }, [cadenceLeads])

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev)
      if (next.has(leadId)) next.delete(leadId); else next.add(leadId)
      return next
    })
  }

  const handleMoveLeads = async () => {
    if (!moveTargetCadenceId || !id || selectedLeadIds.size === 0) return
    setIsMoving(true)
    try {
      // Cancel pending schedules in current cadence
      await supabase.from('schedules')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .in('lead_id', Array.from(selectedLeadIds))
        .eq('cadence_id', id).eq('status', 'scheduled')
      // Remove from current cadence
      await supabase.from('cadence_leads').delete()
        .in('lead_id', Array.from(selectedLeadIds)).eq('cadence_id', id)
      // Add to destination cadence
      for (const leadId of selectedLeadIds) {
        await assignLeadToCadence(leadId, moveTargetCadenceId)
      }
      const destName = cadences.find(c => c.id === moveTargetCadenceId)?.name
      toast.success(`${selectedLeadIds.size} lead${selectedLeadIds.size !== 1 ? 's' : ''} movido${selectedLeadIds.size !== 1 ? 's' : ''} a "${destName}"`)
      setSelectedLeadIds(new Set())
      setIsMoveDialogOpen(false)
      setMoveTargetCadenceId('')
      refetchCadenceLeads()
    } catch {
      toast.error('Error al mover leads')
    } finally {
      setIsMoving(false)
    }
  }

  const handleRemoveDuplicates = async () => {
    if (!id || duplicatesToRemoveIds.size === 0) return
    await supabase.from('schedules')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .in('lead_id', Array.from(duplicatesToRemoveIds))
      .eq('cadence_id', id).eq('status', 'scheduled')
    const { error } = await supabase.from('cadence_leads').delete()
      .in('lead_id', Array.from(duplicatesToRemoveIds)).eq('cadence_id', id)
    if (error) { toast.error('Error al eliminar duplicados'); return }
    toast.success(`${duplicatesToRemoveIds.size} duplicado${duplicatesToRemoveIds.size !== 1 ? 's' : ''} eliminado${duplicatesToRemoveIds.size !== 1 ? 's' : ''}`)
    setShowDuplicatesMode(false)
    setSelectedLeadIds(new Set())
    refetchCadenceLeads()
  }

  // State for Start Automation dialog
  const [isAutomationOpen, setIsAutomationOpen] = useState(false)

  // State for add/edit step dialog
  const [isAddStepOpen, setIsAddStepOpen] = useState(false)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [newStep, setNewStep] = useState<{
    step_type: StepType
    step_label: string
    day_offset: number
    message_template: string
    template_id: string
    ai_prompt_id: string
    ai_research_prompt_id: string
    ai_example_section_id: string
    reply_to_step_id: string
    cc: string
  }>({
    step_type: 'linkedin_message',
    step_label: '',
    day_offset: 0,
    message_template: '',
    template_id: '',
    ai_prompt_id: '',
    ai_research_prompt_id: '',
    ai_example_section_id: '',
    reply_to_step_id: '',
    cc: '',
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
      reply_to_step_id: '',
      cc: '',
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
        <p className="text-muted-foreground">Cadencia no encontrada</p>
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
          reply_to_step_id: newStep.reply_to_step_id && newStep.reply_to_step_id !== 'none' ? newStep.reply_to_step_id : null,
          cc: newStep.cc.trim() || null,
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
        reply_to_step_id: '',
        cc: '',
      })
      toast.success('Step added successfully')
    } catch (error) {
      console.error('Error adding step:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to add step')
    } finally {
      setSaving(false)
    }
  }

  const handleOpenEditStep = (step: CadenceStep) => {
    const config = step.config_json as Record<string, unknown>
    setEditingStepId(step.id)
    setNewStep({
      step_type: step.step_type as StepType,
      step_label: step.step_label,
      day_offset: step.day_offset,
      message_template: (config?.message_template as string) || '',
      template_id: (config?.template_id as string) || '',
      ai_prompt_id: (config?.ai_prompt_id as string) || '',
      ai_research_prompt_id: (config?.ai_research_prompt_id as string) || '',
      ai_example_section_id: (config?.ai_example_section_id as string) || '',
      reply_to_step_id: (config?.reply_to_step_id as string) || '',
      cc: (config?.cc as string) || '',
    })
    setIsAddStepOpen(true)
  }

  const handleSaveEditStep = async () => {
    if (!editingStepId) return
    setSaving(true)
    try {
      await updateStep(editingStepId, {
        step_type: newStep.step_type,
        step_label: newStep.step_label || STEP_TYPE_CONFIG[newStep.step_type].label,
        day_offset: newStep.day_offset,
        config_json: {
          message_template: newStep.message_template,
          template_id: newStep.template_id && newStep.template_id !== 'none' ? newStep.template_id : null,
          ai_prompt_id: newStep.ai_prompt_id && newStep.ai_prompt_id !== 'none' ? newStep.ai_prompt_id : null,
          ai_research_prompt_id: newStep.ai_research_prompt_id && newStep.ai_research_prompt_id !== 'none' ? newStep.ai_research_prompt_id : null,
          ai_example_section_id: newStep.ai_example_section_id && newStep.ai_example_section_id !== 'none' ? newStep.ai_example_section_id : null,
          reply_to_step_id: newStep.reply_to_step_id && newStep.reply_to_step_id !== 'none' ? newStep.reply_to_step_id : null,
          cc: newStep.cc.trim() || null,
        },
      })
      setIsAddStepOpen(false)
      setEditingStepId(null)
      setNewStep({
        step_type: 'linkedin_message',
        step_label: '',
        day_offset: 0,
        message_template: '',
        template_id: '',
        ai_prompt_id: '',
        ai_research_prompt_id: '',
        ai_example_section_id: '',
        reply_to_step_id: '',
        cc: '',
      })
      toast.success('Step updated successfully')
    } catch (error) {
      console.error('Error updating step:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update step')
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
              {isEditMode ? 'Salir de Edición' : 'Editar'}
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
          <TabsTrigger value="companies">
            <Building2 className="h-4 w-4 mr-1" />
            Companies
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
                                          onClick={() => handleOpenEditStep(step)}
                                        >
                                          <Pencil className="mr-1 h-4 w-4" />
                                          Edit
                                        </Button>
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
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Leads by Step
                </CardTitle>
                <CardDescription>
                  Manage leads in this cadence and execute steps
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
                {/* Select All / Deselect All */}
                {cadenceLeads.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedLeadIds.size === cadenceLeads.length) {
                        setSelectedLeadIds(new Set())
                      } else {
                        setSelectedLeadIds(new Set(cadenceLeads.map((l) => l.id)))
                      }
                    }}
                  >
                    {selectedLeadIds.size === cadenceLeads.length && cadenceLeads.length > 0
                      ? 'Deseleccionar todos'
                      : `Seleccionar todos (${cadenceLeads.length})`}
                  </Button>
                )}
                {/* Duplicate controls */}
                {!showDuplicatesMode ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowDuplicatesMode(true); setSelectedLeadIds(new Set()) }}
                    disabled={duplicateLeadIds.size === 0}
                    title={duplicateLeadIds.size === 0 ? 'No hay duplicados' : `${duplicateLeadIds.size} leads duplicados detectados`}
                  >
                    <AlertTriangle className="h-4 w-4 mr-1.5 text-amber-500" />
                    Duplicados {duplicateLeadIds.size > 0 && <Badge variant="secondary" className="ml-1 text-xs">{duplicateLeadIds.size}</Badge>}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleRemoveDuplicates}
                      disabled={duplicatesToRemoveIds.size === 0}
                    >
                      <XCircle className="h-4 w-4 mr-1.5" />
                      Eliminar {duplicatesToRemoveIds.size} duplicado{duplicatesToRemoveIds.size !== 1 ? 's' : ''}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setShowDuplicatesMode(false); setSelectedLeadIds(new Set()) }}>
                      Cancelar
                    </Button>
                  </>
                )}
                {/* Move controls */}
                {selectedLeadIds.size > 0 && (
                  <Button
                    size="sm"
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={() => setIsMoveDialogOpen(true)}
                  >
                    <ChevronRight className="h-4 w-4 mr-1.5" />
                    Mover {selectedLeadIds.size} a cadencia
                  </Button>
                )}
              </div>
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
                  {leadsByStep['unassigned']?.filter(l => !showDuplicatesMode || duplicateLeadIds.has(l.id)).length > 0 && (
                    <div>
                      <h3 className="mb-4 flex items-center gap-2 font-medium text-muted-foreground">
                        <AlertTriangle className="h-4 w-4" />
                        Unassigned ({leadsByStep['unassigned'].filter(l => !showDuplicatesMode || duplicateLeadIds.has(l.id)).length})
                      </h3>
                      <div className="space-y-2">
                        {leadsByStep['unassigned'].filter(l => !showDuplicatesMode || duplicateLeadIds.has(l.id)).map((lead) => (
                          <div
                            key={lead.id}
                            className={`flex items-center justify-between rounded-lg border p-3 ${duplicateLeadIds.has(lead.id) && showDuplicatesMode ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : ''}`}
                          >
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                type="checkbox"
                                checked={selectedLeadIds.has(lead.id)}
                                onChange={() => toggleLeadSelection(lead.id)}
                                className="rounded shrink-0"
                              />
                              <div>
                                <p className="font-medium flex items-center gap-1.5">
                                  {lead.first_name} {lead.last_name}
                                  {duplicateLeadIds.has(lead.id) && <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300">Duplicado</Badge>}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {lead.company} {lead.title && `- ${lead.title}`}
                                </p>
                              </div>
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
                        const leadsAtStep = (leadsByStep[step.id] || [])
                          .filter(l => !showDuplicatesMode || duplicateLeadIds.has(l.id))
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
                                    className={`rounded-lg border p-4 ${duplicateLeadIds.has(lead.id) && showDuplicatesMode ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : ''}`}
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1 flex items-start gap-2">
                                        <input
                                          type="checkbox"
                                          checked={selectedLeadIds.has(lead.id)}
                                          onChange={() => toggleLeadSelection(lead.id)}
                                          className="rounded mt-0.5 shrink-0"
                                        />
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <p className="font-medium">
                                              {lead.first_name} {lead.last_name}
                                            </p>
                                            {duplicateLeadIds.has(lead.id) && <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300">Duplicado</Badge>}
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
                {schedules.some((s) => s.status === 'failed') && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-orange-600 border-orange-200 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-950/30"
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Retry Failed
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuItem onClick={() => retryFailed()} className="font-medium">
                        <RefreshCw className="h-4 w-4 mr-2 text-orange-600" />
                        Reintentar todos ({schedules.filter(s => s.status === 'failed').length})
                      </DropdownMenuItem>
                      {failedByStepType.size > 1 && (
                        <>
                          <DropdownMenuSeparator />
                          {Array.from(failedByStepType.entries()).map(([type, count]) => {
                            const Icon = STEP_ICONS[type] || Clock
                            const config = STEP_TYPE_CONFIG[type]
                            return (
                              <DropdownMenuItem key={type} onClick={() => retryFailed(type)}>
                                <Icon className="h-4 w-4 mr-2 text-muted-foreground" />
                                {config?.label || type} ({count})
                              </DropdownMenuItem>
                            )
                          })}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button variant="destructive" size="sm" onClick={cancelAllScheduled}>
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancelar programados
                </Button>
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

        {/* Companies tab */}
        <TabsContent value="companies">
          <CompaniesTab leads={cadenceLeads} />
        </TabsContent>
      </Tabs>

      {/* Add Step Dialog */}
      <Dialog open={isAddStepOpen} onOpenChange={(open) => {
        setIsAddStepOpen(open)
        if (!open) {
          setEditingStepId(null)
          setNewStep({
            step_type: 'linkedin_message',
            step_label: '',
            day_offset: 0,
            message_template: '',
            template_id: '',
            ai_prompt_id: '',
            ai_research_prompt_id: '',
            ai_example_section_id: '',
            reply_to_step_id: '',
            cc: '',
          })
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingStepId ? 'Editar Paso' : 'Agregar Paso'}</DialogTitle>
            <DialogDescription>{editingStepId ? 'Modificar la configuración de este paso' : 'Configura un nuevo paso para tu cadencia'}</DialogDescription>
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

            {/* Reply-to step selector for email_reply */}
            {newStep.step_type === 'email_reply' && (
              <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/50 dark:bg-violet-950/20 dark:border-violet-800 p-4">
                <div className="flex items-center gap-2">
                  <Reply className="h-4 w-4 text-violet-600" />
                  <Label className="text-sm font-medium">Responder a este step de email</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  El follow-up se enviará como respuesta dentro del mismo hilo de Gmail del email seleccionado.
                </p>
                <Select
                  value={newStep.reply_to_step_id || 'none'}
                  onValueChange={(v) => setNewStep(prev => ({ ...prev, reply_to_step_id: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar el email original..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Email más reciente (automático)</SelectItem>
                    {steps
                      .filter(s => s.step_type === 'send_email')
                      .sort((a, b) => a.day_offset !== b.day_offset ? a.day_offset - b.day_offset : a.order_in_day - b.order_in_day)
                      .map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          Day {s.day_offset}: {s.step_label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* CC field for email steps */}
            {(newStep.step_type === 'send_email' || newStep.step_type === 'email_reply') && (
              <div className="space-y-2">
                <Label>CC (copia)</Label>
                <Input
                  value={newStep.cc}
                  onChange={(e) => setNewStep((prev) => ({ ...prev, cc: e.target.value }))}
                  placeholder="cc@empresa.com, otro@empresa.com"
                />
                <p className="text-xs text-muted-foreground">
                  Opcional. Separar múltiples emails con comas. Se enviará en copia en cada email de este step.
                </p>
              </div>
            )}

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
                      <SelectValue placeholder="Seleccionar plantilla..." />
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
              Cancelar
            </Button>
            <Button onClick={editingStepId ? handleSaveEditStep : handleAddStep} disabled={saving}>
              {saving ? (editingStepId ? 'Saving...' : 'Adding...') : (editingStepId ? 'Save Changes' : 'Agregar Paso')}
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
              <Label>Seleccionar Lead</Label>
              <Select
                value={testStepConfig.leadId}
                onValueChange={(value) =>
                  setTestStepConfig((prev) => ({ ...prev, leadId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegir un lead..." />
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
                    placeholder="Escribe el mensaje a enviar..."
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
                    placeholder="Escribe tu comentario..."
                    rows={3}
                  />
                </div>
              )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTestStepOpen(false)}>
              Cancelar
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
            <AlertDialogTitle>Quitar de Cadencia</AlertDialogTitle>
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
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
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

      {/* Move Leads Dialog */}
      <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Mover {selectedLeadIds.size} lead{selectedLeadIds.size !== 1 ? 's' : ''} a otra cadencia
            </DialogTitle>
            <DialogDescription>
              Los leads serán eliminados de esta cadencia y añadidos a la cadencia seleccionada. Los envíos programados serán cancelados.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={moveTargetCadenceId} onValueChange={setMoveTargetCadenceId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cadencia destino..." />
              </SelectTrigger>
              <SelectContent>
                {cadences
                  .filter((c) => c.id !== id)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      <span className="text-muted-foreground ml-1 text-xs">({c.status})</span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsMoveDialogOpen(false); setMoveTargetCadenceId('') }}>
              Cancelar
            </Button>
            <Button
              onClick={handleMoveLeads}
              disabled={!moveTargetCadenceId || isMoving}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isMoving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Moviendo...
                </>
              ) : (
                <>
                  <ChevronRight className="mr-2 h-4 w-4" />
                  Mover leads
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Companies Tab ─────────────────────────────────────────────────────────────
const LEAD_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active:    { label: 'Active',    className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  scheduled: { label: 'Scheduled', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  paused:    { label: 'Paused',    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
  generated: { label: 'Generated', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  sent:      { label: 'Sent',      className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
}

function CompaniesTab({ leads }: { leads: Lead[] }) {
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Group leads by company
  const grouped = leads.reduce<Record<string, Lead[]>>((acc, lead) => {
    const key = lead.company?.trim() || '(Sin empresa)'
    if (!acc[key]) acc[key] = []
    acc[key].push(lead)
    return acc
  }, {})

  const companies = Object.entries(grouped)
    .sort((a, b) => b[1].length - a[1].length)
    .filter(([name]) =>
      !search || name.toLowerCase().includes(search.toLowerCase())
    )

  const selectedLeads = selectedCompany ? (grouped[selectedCompany] || []) : []

  if (leads.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No hay leads en esta cadencia todavía.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* Company list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            {companies.length} empresa{companies.length !== 1 ? 's' : ''}
          </CardTitle>
          <div className="relative mt-1">
            <input
              type="text"
              placeholder="Buscar empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y max-h-[560px] overflow-y-auto">
            {companies.map(([name, compLeads]) => {
              const isSelected = selectedCompany === name
              const statusCounts = compLeads.reduce<Record<string, number>>((acc, l) => {
                const s = l.status ?? 'active'
                acc[s] = (acc[s] || 0) + 1
                return acc
              }, {})

              return (
                <button
                  key={name}
                  onClick={() => setSelectedCompany(isSelected ? null : name)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors ${
                    isSelected ? 'bg-muted/70 border-l-2 border-primary' : ''
                  }`}
                >
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {Object.entries(statusCounts).map(([status, count]) => {
                        const sc = LEAD_STATUS_LABELS[status]
                        return sc ? (
                          <span
                            key={status}
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${sc.className}`}
                          >
                            {count} {sc.label}
                          </span>
                        ) : null
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="secondary" className="text-xs">{compLeads.length}</Badge>
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Lead detail panel */}
      <Card>
        {!selectedCompany ? (
          <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Selecciona una empresa para ver sus leads</p>
          </CardContent>
        ) : (
          <>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">{selectedCompany}</CardTitle>
                <Badge variant="secondary">{selectedLeads.length} lead{selectedLeads.length !== 1 ? 's' : ''}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {selectedLeads.map((lead) => {
                  const sc = LEAD_STATUS_LABELS[lead.status ?? 'active']
                  return (
                    <div key={lead.id} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {lead.first_name} {lead.last_name}
                          </span>
                          {sc && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${sc.className}`}>
                              {sc.label}
                            </span>
                          )}
                        </div>
                        {lead.title && (
                          <p className="text-xs text-muted-foreground mt-0.5">{lead.title}</p>
                        )}
                        {lead.email && (
                          <p className="text-xs text-muted-foreground">{lead.email}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {lead.linkedin_url && (
                          <a
                            href={lead.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center h-7 w-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Ver LinkedIn"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
