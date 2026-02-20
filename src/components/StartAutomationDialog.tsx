import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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
  Zap,
  Loader2,
  Users,
  Brain,
  AlertTriangle,
  Search,
  CheckCircle,
  FlaskConical,
  BookOpen,
  Clock,
  FileText,
} from 'lucide-react'
import { STEP_TYPE_CONFIG, type Cadence, type CadenceStep, type Lead } from '@/types'
import type { AIPrompt, ExampleSection } from '@/lib/edge-functions'

interface StartAutomationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cadence: Cadence
  steps: CadenceStep[]
  aiPrompts: AIPrompt[]
}

export function StartAutomationDialog({
  open,
  onOpenChange,
  cadence,
  steps,
  aiPrompts,
}: StartAutomationDialogProps) {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const queryClient = useQueryClient()
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [starting, setStarting] = useState(false)
  // Per-step overrides: stepId → promptId/sectionId
  const [stepMessageOverrides, setStepMessageOverrides] = useState<Record<string, string>>({})
  const [stepResearchOverrides, setStepResearchOverrides] = useState<Record<string, string>>({})
  const [stepExampleOverrides, setStepExampleOverrides] = useState<Record<string, string>>({})
  const [stepTemplateOverrides, setStepTemplateOverrides] = useState<Record<string, string>>({})
  // LinkedIn Connect: whether to send a note with the connection request
  const [stepSendNote, setStepSendNote] = useState<Record<string, boolean>>({})
  // Per-step scheduled times (HH:MM) and timezone
  const [stepScheduledTimes, setStepScheduledTimes] = useState<Record<string, string>>(() => {
    const sorted = [...steps].sort((a, b) => a.day_offset - b.day_offset || a.order_in_day - b.order_in_day)
    const times: Record<string, string> = {}
    let currentHour = 9
    let lastDay = -1
    sorted.forEach((step) => {
      if (step.day_offset !== lastDay) {
        currentHour = 9
        lastDay = step.day_offset
      }
      const existing = (step.config_json as Record<string, unknown>)?.scheduled_time as string | undefined
      times[step.id] = existing || `${Math.min(currentHour, 23).toString().padStart(2, '0')}:00`
      currentHour++
    })
    return times
  })
  const [timezone, setTimezone] = useState(cadence.timezone || 'America/New_York')

  // Fetch example sections
  const { data: exampleSections = [] } = useQuery({
    queryKey: ['example-sections', orgId, user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const { data, error } = await supabase
        .from('example_sections')
        .select('*')
        .eq('org_id', orgId!)
        .eq('owner_id', user.id)
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as ExampleSection[]
    },
    enabled: !!user?.id && !!orgId && open,
  })

  // Fetch templates
  const { data: templates = [] } = useQuery({
    queryKey: ['templates-for-automation', orgId, user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const { data, error } = await supabase
        .from('templates')
        .select('id, name, body_template')
        .eq('org_id', orgId!)
        .eq('owner_id', user.id)
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as { id: string; name: string; body_template: string }[]
    },
    enabled: !!user?.id && !!orgId && open,
  })

  // Fetch all leads
  const { data: allLeads = [] } = useQuery({
    queryKey: ['leads-for-automation', orgId, user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('org_id', orgId!)
        .eq('owner_id', user.id)
        .order('first_name', { ascending: true })
      if (error) throw error
      return (data || []) as Lead[]
    },
    enabled: !!user?.id && !!orgId && open,
  })

  // Fetch leads already in this cadence
  const { data: existingCadenceLeads = [] } = useQuery({
    queryKey: ['cadence-leads-existing', cadence.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cadence_leads')
        .select('lead_id')
        .eq('cadence_id', cadence.id)
        .in('status', ['active', 'scheduled', 'pending', 'generated'])
      if (error) throw error
      return (data || []).map((cl: { lead_id: string }) => cl.lead_id)
    },
    enabled: open,
  })

  const existingLeadSet = new Set(existingCadenceLeads)

  // Filter leads — show only leads already in this cadence
  const availableLeads = allLeads.filter((lead) => existingLeadSet.has(lead.id))
  const filteredLeads = availableLeads.filter((lead) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      lead.first_name?.toLowerCase().includes(q) ||
      lead.last_name?.toLowerCase().includes(q) ||
      lead.company?.toLowerCase().includes(q) ||
      lead.email?.toLowerCase().includes(q)
    )
  })

  // Steps sorted by day
  const sortedSteps = [...steps].sort((a, b) => a.day_offset - b.day_offset || a.order_in_day - b.order_in_day)

  // Check which steps still need AI prompts (accounting for overrides)
  const stepsWithoutAI = sortedSteps.filter((step) => {
    const config = step.config_json as Record<string, unknown>
    const hasMessageOverride = !!stepMessageOverrides[step.id] && stepMessageOverrides[step.id] !== 'none'
    const hasTemplateOverride = !!stepTemplateOverrides[step.id] && stepTemplateOverrides[step.id] !== 'none'
    // LinkedIn Connect with sendNote off doesn't need a prompt
    if (step.step_type === 'linkedin_connect' && !stepSendNote[step.id]) return false
    return !config?.ai_prompt_id && !hasMessageOverride && !hasTemplateOverride && !config?.message_template && !config?.template_id && STEP_TYPE_CONFIG[step.step_type].hasTextBox
  })

  // Filtered prompt lists
  const researchPrompts = aiPrompts.filter((p) => p.prompt_type === 'research')

  const toggleLead = (leadId: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev)
      if (next.has(leadId)) {
        next.delete(leadId)
      } else {
        next.add(leadId)
      }
      return next
    })
  }

  const toggleAll = () => {
    if (selectedLeadIds.size === filteredLeads.length) {
      setSelectedLeadIds(new Set())
    } else {
      setSelectedLeadIds(new Set(filteredLeads.map((l) => l.id)))
    }
  }

  const handleStart = async () => {
    if (!user || selectedLeadIds.size === 0 || sortedSteps.length === 0) return

    setStarting(true)
    try {
      const firstStep = sortedSteps[0]
      const leadIds = Array.from(selectedLeadIds)

      // 0. Save scheduled_time, AI prompt overrides, and send_note to all step config_json
      for (const step of sortedSteps) {
        const existingConfig = (step.config_json || {}) as Record<string, unknown>
        const updates: Record<string, unknown> = { ...existingConfig }
        let changed = false

        // Scheduled time
        const time = stepScheduledTimes[step.id]
        if (time) { updates.scheduled_time = time; changed = true }

        // AI prompt overrides
        const msgId = stepMessageOverrides[step.id]
        if (msgId) { updates.ai_prompt_id = msgId === 'none' ? null : msgId; changed = true }

        const resId = stepResearchOverrides[step.id]
        if (resId) { updates.ai_research_prompt_id = resId === 'none' ? null : resId; changed = true }

        const exId = stepExampleOverrides[step.id]
        if (exId) { updates.ai_example_section_id = exId === 'none' ? null : exId; changed = true }

        const tplId = stepTemplateOverrides[step.id]
        if (tplId) {
          updates.template_id = tplId === 'none' ? null : tplId
          // If a template is selected, also save the template body as message_template
          if (tplId !== 'none') {
            const tpl = templates.find((t) => t.id === tplId)
            if (tpl) updates.message_template = tpl.body_template
          }
          changed = true
        }

        // Send note flag for LinkedIn Connect steps
        if (stepSendNote[step.id] !== undefined) {
          updates.send_note = stepSendNote[step.id]
          changed = true
        }

        if (changed) {
          await supabase
            .from('cadence_steps')
            .update({ config_json: updates })
            .eq('id', step.id)
        }
      }

      // 1. Create cadence_leads entries for each selected lead
      const cadenceLeadInserts = leadIds.map((leadId) => ({
        cadence_id: cadence.id,
        lead_id: leadId,
        owner_id: user.id,
        org_id: orgId!,
        current_step_id: firstStep.id,
        status: 'scheduled',
      }))

      const { error: clError } = await supabase.from('cadence_leads').upsert(cadenceLeadInserts, {
        onConflict: 'cadence_id,lead_id',
      })
      if (clError) throw clError

      // 2. Create lead_step_instances for ALL steps (not just first)
      const lsiInserts = sortedSteps.flatMap((step) =>
        leadIds.map((leadId) => ({
          cadence_id: cadence.id,
          cadence_step_id: step.id,
          lead_id: leadId,
          owner_id: user.id,
          org_id: orgId!,
          status: 'pending',
        }))
      )

      const { error: lsiError } = await supabase.from('lead_step_instances').upsert(lsiInserts, {
        onConflict: 'cadence_step_id,lead_id',
      })
      if (lsiError) throw lsiError

      // 3. Create schedules for ALL steps at their configured times
      const now = new Date()

      // Helper: convert local time (HH:MM) in a timezone to UTC
      const toUTC = (dayOffset: number, timeStr: string, tz: string): Date => {
        const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
        const todayStr = dateFmt.format(now)
        const [y, m, d] = todayStr.split('-').map(Number)
        const target = new Date(y, m - 1, d + dayOffset)
        const [hours, minutes] = timeStr.split(':').map(Number)
        const guessUTC = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate(), hours, minutes, 0)
        const guess = new Date(guessUTC)
        const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' })
        const parts = timeFmt.formatToParts(guess)
        const lH = parseInt(parts.find((p) => p.type === 'hour')?.value || '0')
        const lM = parseInt(parts.find((p) => p.type === 'minute')?.value || '0')
        const lD = parseInt(parts.find((p) => p.type === 'day')?.value || '0')
        let diffMin = (hours * 60 + minutes) - (lH * 60 + lM)
        if (lD !== target.getDate()) diffMin += (target.getDate() > lD ? 1 : -1) * 1440
        return new Date(guessUTC + diffMin * 60 * 1000)
      }

      const scheduleInserts = sortedSteps.flatMap((step) => {
        const stepTime = stepScheduledTimes[step.id] || '09:00'
        const stepUTC = toUTC(step.day_offset, stepTime, timezone)
        const useImmediate = stepUTC <= now

        return leadIds.map((leadId, index) => {
          let scheduleAt: Date
          if (useImmediate) {
            // Time already passed today - execute immediately with stagger
            // Stagger: 60s base + 10s per lead + step order * (leadIds.length * 10 + 30)s gap between steps
            const stepIndex = sortedSteps.indexOf(step)
            scheduleAt = new Date(now)
            scheduleAt.setSeconds(scheduleAt.getSeconds() + 60 + stepIndex * (leadIds.length * 10 + 30) + index * 10)
          } else {
            // Schedule at configured time with small stagger per lead
            scheduleAt = new Date(stepUTC.getTime() + index * 10000)
          }
          return {
            cadence_id: cadence.id,
            cadence_step_id: step.id,
            lead_id: leadId,
            owner_id: user.id,
            org_id: orgId!,
            scheduled_at: scheduleAt.toISOString(),
            timezone: 'UTC',
            status: 'scheduled',
          }
        })
      })

      // Cancel any existing scheduled items for these leads in this cadence (prevent duplicates)
      await supabase
        .from('schedules')
        .update({ status: 'canceled', last_error: 'Replaced by new automation run', updated_at: new Date().toISOString() })
        .eq('cadence_id', cadence.id)
        .eq('status', 'scheduled')
        .in('lead_id', leadIds)

      const { error: schedError } = await supabase.from('schedules').insert(scheduleInserts)
      if (schedError) throw schedError

      // 4. Update cadence to automated + active with timezone
      const { error: cadError } = await supabase
        .from('cadences')
        .update({
          automation_mode: 'automated',
          status: 'active',
          timezone: timezone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cadence.id)
      if (cadError) throw cadError

      // 5. Create notification
      await supabase.from('notifications').insert({
        owner_id: user.id,
        org_id: orgId!,
        cadence_id: cadence.id,
        type: 'automation_started',
        title: `Automatizacion iniciada: ${cadence.name}`,
        body: `Se inicio la automatizacion para ${leadIds.length} leads con ${steps.length} steps.`,
        channel: 'system',
      })

      // 6. Log activity
      await supabase.from('activity_log').insert({
        owner_id: user.id,
        org_id: orgId!,
        cadence_id: cadence.id,
        action: 'automation_started',
        status: 'ok',
        details: {
          lead_count: leadIds.length,
          step_count: steps.length,
          first_step_id: firstStep.id,
        },
      })

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['cadences'] })
      queryClient.invalidateQueries({ queryKey: ['cadence-leads-direct'] })

      toast.success(`Automatizacion iniciada para ${leadIds.length} leads`)
      onOpenChange(false)
      setSelectedLeadIds(new Set())
      setSearchQuery('')
      setStepMessageOverrides({})
      setStepResearchOverrides({})
      setStepExampleOverrides({})
      setStepTemplateOverrides({})
      setStepSendNote({})
      setStepScheduledTimes({})
    } catch (error) {
      console.error('Error starting automation:', error)
      toast.error(error instanceof Error ? error.message : 'Error al iniciar la automatizacion')
    } finally {
      setStarting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-violet-600" />
            Iniciar Automatizacion
          </DialogTitle>
          <DialogDescription>
            Selecciona los leads para ejecutar automaticamente la cadencia "{cadence.name}"
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Step Summary */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-2">
              Steps de la cadencia ({sortedSteps.length})
            </h3>
            <div className="flex items-center gap-3 rounded-lg border p-2.5">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <label className="text-sm flex-1">Zona horaria</label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="w-64 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="Pacific/Honolulu">Hawaii (HST) GMT-10</SelectItem>
                  <SelectItem value="America/Anchorage">Alaska (AKST) GMT-9</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific (PST) GMT-8</SelectItem>
                  <SelectItem value="America/Denver">Mountain (MST) GMT-7</SelectItem>
                  <SelectItem value="America/Chicago">Central (CST) GMT-6</SelectItem>
                  <SelectItem value="America/Mexico_City">Mexico (CST) GMT-6</SelectItem>
                  <SelectItem value="America/New_York">Eastern (EST) GMT-5</SelectItem>
                  <SelectItem value="America/Bogota">Colombia (COT) GMT-5</SelectItem>
                  <SelectItem value="America/Lima">Peru (PET) GMT-5</SelectItem>
                  <SelectItem value="America/Caracas">Venezuela (VET) GMT-4</SelectItem>
                  <SelectItem value="America/Santiago">Chile (CLT) GMT-4</SelectItem>
                  <SelectItem value="America/Argentina/Buenos_Aires">Argentina (ART) GMT-3</SelectItem>
                  <SelectItem value="America/Sao_Paulo">Brazil (BRT) GMT-3</SelectItem>
                  <SelectItem value="Atlantic/Azores">Azores (AZOT) GMT-1</SelectItem>
                  <SelectItem value="UTC">UTC GMT+0</SelectItem>
                  <SelectItem value="Europe/London">London (GMT) GMT+0</SelectItem>
                  <SelectItem value="Europe/Madrid">Spain (CET) GMT+1</SelectItem>
                  <SelectItem value="Europe/Paris">France (CET) GMT+1</SelectItem>
                  <SelectItem value="Europe/Berlin">Germany (CET) GMT+1</SelectItem>
                  <SelectItem value="Europe/Bucharest">Eastern Europe (EET) GMT+2</SelectItem>
                  <SelectItem value="Asia/Jerusalem">Israel (IST) GMT+2</SelectItem>
                  <SelectItem value="Africa/Johannesburg">South Africa (SAST) GMT+2</SelectItem>
                  <SelectItem value="Europe/Istanbul">Turkey (TRT) GMT+3</SelectItem>
                  <SelectItem value="Asia/Riyadh">Saudi Arabia (AST) GMT+3</SelectItem>
                  <SelectItem value="Asia/Dubai">Dubai (GST) GMT+4</SelectItem>
                  <SelectItem value="Asia/Karachi">Pakistan (PKT) GMT+5</SelectItem>
                  <SelectItem value="Asia/Kolkata">India (IST) GMT+5:30</SelectItem>
                  <SelectItem value="Asia/Dhaka">Bangladesh (BST) GMT+6</SelectItem>
                  <SelectItem value="Asia/Bangkok">Thailand (ICT) GMT+7</SelectItem>
                  <SelectItem value="Asia/Singapore">Singapore (SGT) GMT+8</SelectItem>
                  <SelectItem value="Asia/Shanghai">China (CST) GMT+8</SelectItem>
                  <SelectItem value="Asia/Tokyo">Japan (JST) GMT+9</SelectItem>
                  <SelectItem value="Asia/Seoul">Korea (KST) GMT+9</SelectItem>
                  <SelectItem value="Australia/Sydney">Australia (AEST) GMT+10</SelectItem>
                  <SelectItem value="Pacific/Auckland">New Zealand (NZST) GMT+12</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              {sortedSteps.map((step) => {
                const config = step.config_json as Record<string, unknown>
                const needsContent = STEP_TYPE_CONFIG[step.step_type].hasTextBox
                const isConnect = step.step_type === 'linkedin_connect'
                const sendNote = !!stepSendNote[step.id]

                // Steps that don't need any content at all (e.g. LinkedIn Like)
                if (!needsContent && !isConnect) {
                  return (
                    <div
                      key={step.id}
                      className="flex items-center gap-3 rounded-lg border p-2.5 text-sm"
                    >
                      <Badge variant="outline" className="text-xs shrink-0">
                        Dia {step.day_offset}
                      </Badge>
                      <span className="flex-1 truncate">{step.step_label}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Input
                          type="time"
                          value={stepScheduledTimes[step.id] || '09:00'}
                          onChange={(e) => setStepScheduledTimes((prev) => ({ ...prev, [step.id]: e.target.value }))}
                          className="w-28 h-7 text-xs"
                        />
                        <Badge variant="secondary" className="text-xs shrink-0">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          OK
                        </Badge>
                      </div>
                    </div>
                  )
                }

                // For LinkedIn Connect: show toggle for sending note
                // For other content steps: always show selectors
                const showSelectors = isConnect ? sendNote : true

                // Filter message prompts compatible with this step type
                const compatibleMessagePrompts = aiPrompts.filter(
                  (p) => p.prompt_type === 'message' && (p.step_type === step.step_type || p.step_type === null)
                )

                // Current values (override → existing config → none)
                const currentMessageId = stepMessageOverrides[step.id] || (config?.ai_prompt_id as string) || 'none'
                const currentResearchId = stepResearchOverrides[step.id] || (config?.ai_research_prompt_id as string) || 'none'
                const currentExampleId = stepExampleOverrides[step.id] || (config?.ai_example_section_id as string) || 'none'
                const currentTemplateId = stepTemplateOverrides[step.id] || (config?.template_id as string) || 'none'

                return (
                  <div key={step.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline" className="text-xs shrink-0">
                        Dia {step.day_offset}
                      </Badge>
                      <span className="font-medium flex-1 truncate">{step.step_label}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Input
                          type="time"
                          value={stepScheduledTimes[step.id] || '09:00'}
                          onChange={(e) => setStepScheduledTimes((prev) => ({ ...prev, [step.id]: e.target.value }))}
                          className="w-28 h-7 text-xs"
                        />
                        {isConnect && (
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground whitespace-nowrap">
                            <Checkbox
                              checked={sendNote}
                              onCheckedChange={(checked) =>
                                setStepSendNote((prev) => ({ ...prev, [step.id]: !!checked }))
                              }
                            />
                            Enviar nota con AI
                          </label>
                        )}
                      </div>
                    </div>
                    {showSelectors && (
                      <div className="grid grid-cols-4 gap-2">
                        {/* Message Prompt */}
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Brain className="h-3 w-3" /> Prompt de Mensaje
                          </label>
                          <Select
                            value={currentMessageId}
                            onValueChange={(value) =>
                              setStepMessageOverrides((prev) => ({ ...prev, [step.id]: value }))
                            }
                          >
                            <SelectTrigger
                              className={`h-7 text-xs ${
                                currentMessageId === 'none'
                                  ? 'border-destructive/50 text-destructive'
                                  : 'border-violet-300 text-violet-600'
                              }`}
                            >
                              <SelectValue placeholder="Sin prompt" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sin prompt</SelectItem>
                              {compatibleMessagePrompts.map((prompt) => (
                                <SelectItem key={prompt.id} value={prompt.id}>
                                  {prompt.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* Research Prompt */}
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <FlaskConical className="h-3 w-3" /> Prompt de Investigacion
                          </label>
                          <Select
                            value={currentResearchId}
                            onValueChange={(value) =>
                              setStepResearchOverrides((prev) => ({ ...prev, [step.id]: value }))
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Ninguno" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Ninguno</SelectItem>
                              {researchPrompts.map((prompt) => (
                                <SelectItem key={prompt.id} value={prompt.id}>
                                  {prompt.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* Example Section */}
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <BookOpen className="h-3 w-3" /> Mensajes Base
                          </label>
                          <Select
                            value={currentExampleId}
                            onValueChange={(value) =>
                              setStepExampleOverrides((prev) => ({ ...prev, [step.id]: value }))
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Ninguno" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Ninguno</SelectItem>
                              {exampleSections.map((section) => (
                                <SelectItem key={section.id} value={section.id}>
                                  {section.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* Template */}
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Template
                          </label>
                          <Select
                            value={currentTemplateId}
                            onValueChange={(value) =>
                              setStepTemplateOverrides((prev) => ({ ...prev, [step.id]: value }))
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Ninguno" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Ninguno</SelectItem>
                              {templates.map((tpl) => (
                                <SelectItem key={tpl.id} value={tpl.id}>
                                  {tpl.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {stepsWithoutAI.length > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {stepsWithoutAI.length} step(s) sin AI prompt ni template. Los mensajes se enviaran vacios o fallaran.
              </p>
            )}
          </div>

          {/* Lead Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Seleccionar Leads ({selectedLeadIds.size} de {availableLeads.length})
              </h3>
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                {selectedLeadIds.size === filteredLeads.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {availableLeads.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No hay leads disponibles. Todos los leads ya estan en esta cadencia.
              </p>
            ) : (
              <div className="max-h-[300px] overflow-y-auto space-y-1 rounded-lg border p-2">
                {filteredLeads.map((lead) => (
                  <label
                    key={lead.id}
                    className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedLeadIds.has(lead.id)}
                      onCheckedChange={() => toggleLead(lead.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {lead.first_name} {lead.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {lead.company}
                        {lead.title && ` - ${lead.title}`}
                      </p>
                    </div>
                    {lead.email && (
                      <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                        {lead.email}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleStart}
            disabled={starting || selectedLeadIds.size === 0}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white"
          >
            {starting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Iniciando...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Iniciar ({selectedLeadIds.size} leads)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
