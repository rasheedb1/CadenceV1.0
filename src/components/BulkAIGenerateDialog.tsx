import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useCadence } from '@/contexts/CadenceContext'
import {
  callEdgeFunction,
  type AIGenerateResponse,
  type AIPrompt,
  type ExampleSection,
  type ExampleMessage,
} from '@/lib/edge-functions'
import type { Lead, CadenceStep, Cadence } from '@/types/cadence'
import {
  Dialog,
  DialogContent,
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sparkles,
  Loader2,
  Star,
  BookOpen,
  XCircle,
  CheckCircle,
  X,
  Send,
  AlertTriangle,
  Pencil,
  LinkIcon,
} from 'lucide-react'
import { toast } from 'sonner'

interface BulkAIGenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leads: Lead[]
  step: CadenceStep
  cadence: Cadence
  onComplete: () => void
}

type Phase = 'config' | 'generating' | 'review' | 'sending' | 'done'
type Tone = 'professional' | 'casual' | 'friendly'

interface LeadGenResult {
  leadId: string
  leadName: string
  company: string | null
  message: string
  subject?: string
  error?: string
  removed?: boolean
}

interface SendResult {
  leadId: string
  leadName: string
  status: 'sent' | 'alreadyConnected' | 'failed'
  error?: string
}

const TONE_OPTIONS: Array<{ value: Tone; label: string }> = [
  { value: 'professional', label: 'Profesional' },
  { value: 'casual', label: 'Casual' },
  { value: 'friendly', label: 'Amigable' },
]

export function BulkAIGenerateDialog({
  open,
  onOpenChange,
  leads,
  step,
  cadence,
  onComplete,
}: BulkAIGenerateDialogProps) {
  const { user, session } = useAuth()
  const { executeStepForLead, markStepDoneForLead } = useCadence()

  const [phase, setPhase] = useState<Phase>('config')
  const [tone, setTone] = useState<Tone>('professional')
  const [selectedMessagePromptId, setSelectedMessagePromptId] = useState<string>('none')
  const [selectedResearchPromptId, setSelectedResearchPromptId] = useState<string>('none')
  const [selectedSectionId, setSelectedSectionId] = useState<string>('none')
  const [customPrompt, setCustomPrompt] = useState('')

  // Generate phase state
  const [genResults, setGenResults] = useState<LeadGenResult[]>([])
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0, currentName: '' })
  const abortRef = useRef(false)

  // Send phase state
  const [sendResults, setSendResults] = useState<SendResult[]>([])
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0, sent: 0, failed: 0, alreadyConnected: 0, currentName: '' })

  const stepType = step.step_type as 'linkedin_message' | 'linkedin_connect' | 'linkedin_comment' | 'send_email'
  const isEmailStep = step.step_type === 'send_email'

  // Fetch message prompts
  const { data: messagePrompts = [] } = useQuery({
    queryKey: ['ai-prompts-message', user?.id, stepType],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('ai_prompts')
        .select('*')
        .eq('owner_id', user.id)
        .eq('prompt_type', 'message')
        .eq('step_type', stepType)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as AIPrompt[]
    },
    enabled: !!user && open,
  })

  // Fetch research prompts
  const { data: researchPrompts = [] } = useQuery({
    queryKey: ['ai-prompts-research', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('ai_prompts')
        .select('*')
        .eq('owner_id', user.id)
        .eq('prompt_type', 'research')
        .order('is_default', { ascending: false })
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as AIPrompt[]
    },
    enabled: !!user && open,
  })

  // Fetch example sections
  const { data: exampleSections = [] } = useQuery({
    queryKey: ['example-sections', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('example_sections')
        .select('*')
        .eq('owner_id', user.id)
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as ExampleSection[]
    },
    enabled: !!user && open,
  })

  // Fetch example messages for selected section
  const { data: sectionMessages = [] } = useQuery({
    queryKey: ['example-messages-section', selectedSectionId],
    queryFn: async () => {
      if (selectedSectionId === 'none') return []
      const { data, error } = await supabase
        .from('example_messages')
        .select('*')
        .eq('section_id', selectedSectionId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data || []) as ExampleMessage[]
    },
    enabled: selectedSectionId !== 'none' && open,
  })

  // Auto-select defaults
  useEffect(() => {
    if (messagePrompts.length > 0 && selectedMessagePromptId === 'none') {
      const defaultPrompt = messagePrompts.find(p => p.is_default)
      if (defaultPrompt) {
        setSelectedMessagePromptId(defaultPrompt.id)
        setTone(defaultPrompt.tone)
      }
    }
  }, [messagePrompts])

  useEffect(() => {
    if (researchPrompts.length > 0 && selectedResearchPromptId === 'none') {
      const defaultPrompt = researchPrompts.find(p => p.is_default)
      if (defaultPrompt) setSelectedResearchPromptId(defaultPrompt.id)
    }
  }, [researchPrompts])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPhase('config')
      setTone('professional')
      setSelectedMessagePromptId('none')
      setSelectedResearchPromptId('none')
      setSelectedSectionId('none')
      setCustomPrompt('')
      setGenResults([])
      setGenProgress({ current: 0, total: 0, currentName: '' })
      setSendResults([])
      setSendProgress({ current: 0, total: 0, sent: 0, failed: 0, alreadyConnected: 0, currentName: '' })
      abortRef.current = false
    }
  }, [open])

  const getMessagePromptBody = (): string | undefined => {
    let body: string | undefined
    if (selectedMessagePromptId !== 'none') {
      body = messagePrompts.find(p => p.id === selectedMessagePromptId)?.prompt_body
    }
    if (body && customPrompt.trim()) {
      return `${body}\n\n## Instrucciones adicionales:\n${customPrompt}`
    }
    return body || customPrompt || undefined
  }

  const getResearchPromptBody = (): string | undefined => {
    if (selectedResearchPromptId !== 'none') {
      return researchPrompts.find(p => p.id === selectedResearchPromptId)?.prompt_body
    }
    return undefined
  }

  const handleMessagePromptChange = (promptId: string) => {
    setSelectedMessagePromptId(promptId)
    if (promptId !== 'none') {
      const prompt = messagePrompts.find(p => p.id === promptId)
      if (prompt) setTone(prompt.tone)
    }
  }

  // --- GENERATE PHASE ---
  const handleGenerateAll = async () => {
    if (!session?.access_token) {
      toast.error('No hay sesion activa')
      return
    }

    abortRef.current = false
    setPhase('generating')
    setGenResults([])
    setGenProgress({ current: 0, total: leads.length, currentName: '' })

    const messageTemplate = getMessagePromptBody()
    const researchPromptBody = getResearchPromptBody()
    const activePrompt = selectedMessagePromptId !== 'none'
      ? messagePrompts.find(p => p.id === selectedMessagePromptId)
      : undefined
    const language = activePrompt?.language || 'es'
    const exampleMessageBodies = sectionMessages.length > 0
      ? sectionMessages.map(m => m.body)
      : undefined

    const results: LeadGenResult[] = []

    for (let i = 0; i < leads.length; i++) {
      if (abortRef.current) break

      const lead = leads[i]
      const leadName = `${lead.first_name} ${lead.last_name}`

      setGenProgress({ current: i + 1, total: leads.length, currentName: leadName })

      try {
        const result = await callEdgeFunction<AIGenerateResponse>(
          'ai-research-generate',
          {
            leadId: lead.id,
            stepType,
            messageTemplate,
            researchPrompt: researchPromptBody,
            tone,
            language,
            exampleMessages: exampleMessageBodies,
          },
          session.access_token
        )

        if (result.success) {
          results.push({
            leadId: lead.id,
            leadName,
            company: lead.company,
            message: result.generatedMessage,
            subject: result.generatedSubject || undefined,
          })
        } else {
          results.push({
            leadId: lead.id,
            leadName,
            company: lead.company,
            message: '',
            error: 'Generacion fallida',
          })
        }
      } catch (err) {
        results.push({
          leadId: lead.id,
          leadName,
          company: lead.company,
          message: '',
          error: err instanceof Error ? err.message : 'Error desconocido',
        })
      }

      setGenResults([...results])

      // 1-second delay between calls
      if (i < leads.length - 1 && !abortRef.current) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    setGenResults(results)
    setPhase('review')
  }

  const handleCancelGeneration = () => {
    abortRef.current = true
    // Move to review with whatever we have so far
    setPhase('review')
  }

  // --- REVIEW PHASE ---
  const updateMessage = (leadId: string, newMessage: string) => {
    setGenResults(prev =>
      prev.map(r => (r.leadId === leadId ? { ...r, message: newMessage } : r))
    )
  }

  const toggleRemove = (leadId: string) => {
    setGenResults(prev =>
      prev.map(r => (r.leadId === leadId ? { ...r, removed: !r.removed } : r))
    )
  }

  const sendableResults = genResults.filter(r => !r.removed && !r.error && r.message.trim())
  const errorCount = genResults.filter(r => r.error).length
  const removedCount = genResults.filter(r => r.removed).length

  // --- SEND PHASE ---
  const handleSendAll = async () => {
    if (!session?.access_token) return

    setPhase('sending')
    setSendResults([])
    setSendProgress({
      current: 0,
      total: sendableResults.length,
      sent: 0,
      failed: 0,
      alreadyConnected: 0,
      currentName: '',
    })

    let sentCount = 0
    let failedCount = 0
    let alreadyConnectedCount = 0
    const results: SendResult[] = []

    for (let i = 0; i < sendableResults.length; i++) {
      const item = sendableResults[i]

      setSendProgress(prev => ({
        ...prev,
        current: i + 1,
        currentName: item.leadName,
      }))

      try {
        const result = await executeStepForLead({
          leadId: item.leadId,
          stepId: step.id,
          cadenceId: cadence.id,
          message: item.message,
          subject: item.subject,
        })

        if (step.step_type === 'linkedin_connect' && result?.alreadyConnected) {
          alreadyConnectedCount++
          results.push({ leadId: item.leadId, leadName: item.leadName, status: 'alreadyConnected' })
        } else {
          sentCount++
          results.push({ leadId: item.leadId, leadName: item.leadName, status: 'sent' })
        }

        await markStepDoneForLead(item.leadId, step.id, cadence.id)
      } catch (err) {
        failedCount++
        results.push({
          leadId: item.leadId,
          leadName: item.leadName,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Error',
        })
      }

      setSendProgress(prev => ({
        ...prev,
        sent: sentCount,
        failed: failedCount,
        alreadyConnected: alreadyConnectedCount,
      }))
      setSendResults([...results])

      // 3-second delay between sends
      if (i < sendableResults.length - 1) {
        await new Promise(r => setTimeout(r, 3000))
      }
    }

    setSendResults(results)
    setPhase('done')
  }

  const handleDone = () => {
    onOpenChange(false)
    onComplete()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (phase === 'generating' || phase === 'sending') return // prevent closing during operations
      onOpenChange(v)
    }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Generate All — {leads.length} leads
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">

          {/* ====== CONFIG PHASE ====== */}
          {phase === 'config' && (
            <>
              {/* Research Prompt */}
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Prompt de Investigacion
                </label>
                <Select value={selectedResearchPromptId} onValueChange={setSelectedResearchPromptId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="No usar ninguno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No usar ninguno</SelectItem>
                    {researchPrompts.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-1.5">
                          {p.is_default && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                          {p.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Message Prompt */}
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Prompt de Mensaje
                </label>
                <Select value={selectedMessagePromptId} onValueChange={handleMessagePromptChange}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="No usar ninguno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No usar ninguno</SelectItem>
                    {messagePrompts.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-1.5">
                          {p.is_default && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                          {p.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Example Section */}
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  <BookOpen className="inline h-3.5 w-3.5 mr-1" />
                  Mensajes Base
                </label>
                <Select value={selectedSectionId} onValueChange={setSelectedSectionId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="No usar ninguno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No usar ninguno</SelectItem>
                    {exampleSections.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedSectionId !== 'none' && sectionMessages.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {sectionMessages.length} {sectionMessages.length === 1 ? 'mensaje' : 'mensajes'} de referencia
                  </p>
                )}
              </div>

              {/* Tone */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Tono:</span>
                <div className="flex gap-1">
                  {TONE_OPTIONS.map(opt => (
                    <Button
                      key={opt.value}
                      variant={tone === opt.value ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setTone(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Custom instructions */}
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Instrucciones adicionales (opcional)
                </label>
                <Textarea
                  placeholder="Ej: Enfocate en la propuesta de valor para empresas de tecnologia..."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>

              {/* Generate button */}
              <div className="flex justify-center pt-4">
                <Button size="lg" onClick={handleGenerateAll}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generar para todos ({leads.length})
                </Button>
              </div>
            </>
          )}

          {/* ====== GENERATING PHASE ====== */}
          {phase === 'generating' && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-purple-500" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">
                  Generando {genProgress.current} / {genProgress.total}
                </p>
                {genProgress.currentName && (
                  <p className="text-xs text-muted-foreground">
                    {genProgress.currentName}...
                  </p>
                )}
              </div>
              <Progress
                value={(genProgress.current / genProgress.total) * 100}
                className="w-64 h-2"
              />
              <p className="text-xs text-muted-foreground">
                Cada lead toma 5-15 segundos
              </p>
              <Button variant="outline" size="sm" onClick={handleCancelGeneration}>
                Cancelar
              </Button>

              {/* Live results count */}
              {genResults.length > 0 && (
                <div className="flex gap-4 text-xs">
                  <span className="text-green-600">
                    {genResults.filter(r => !r.error).length} generados
                  </span>
                  {genResults.some(r => r.error) && (
                    <span className="text-red-500">
                      {genResults.filter(r => r.error).length} fallidos
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ====== REVIEW PHASE ====== */}
          {phase === 'review' && (
            <>
              {/* Summary */}
              <div className="flex items-center gap-3 text-sm">
                <Badge variant="secondary">
                  {sendableResults.length} listos para enviar
                </Badge>
                {errorCount > 0 && (
                  <Badge variant="destructive">
                    {errorCount} fallidos
                  </Badge>
                )}
                {removedCount > 0 && (
                  <Badge variant="outline">
                    {removedCount} removidos
                  </Badge>
                )}
              </div>

              {/* Lead message cards */}
              <ScrollArea className="flex-1 max-h-[50vh]">
                <div className="space-y-3 pr-2">
                  {genResults.map((item) => (
                    <div
                      key={item.leadId}
                      className={`border rounded-lg p-3 space-y-2 ${
                        item.removed ? 'opacity-40' : ''
                      } ${item.error ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{item.leadName}</span>
                          {item.company && (
                            <span className="text-xs text-muted-foreground">
                              {item.company}
                            </span>
                          )}
                          {item.error && (
                            <Badge variant="destructive" className="text-xs h-5">
                              Error
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => toggleRemove(item.leadId)}
                          title={item.removed ? 'Restaurar' : 'Remover'}
                        >
                          {item.removed ? (
                            <Pencil className="h-3.5 w-3.5" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>

                      {item.error ? (
                        <p className="text-xs text-red-500">{item.error}</p>
                      ) : (
                        <>
                          {isEmailStep && item.subject !== undefined && (
                            <Input
                              value={item.subject || ''}
                              onChange={(e) => {
                                setGenResults(prev =>
                                  prev.map(r => (r.leadId === item.leadId ? { ...r, subject: e.target.value } : r))
                                )
                              }}
                              placeholder="Asunto del email..."
                              className="text-sm"
                              disabled={item.removed}
                            />
                          )}
                          <Textarea
                            value={item.message}
                            onChange={(e) => updateMessage(item.leadId, e.target.value)}
                            rows={3}
                            className="text-sm resize-none"
                            disabled={item.removed}
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}

          {/* ====== SENDING PHASE ====== */}
          {phase === 'sending' && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-purple-500" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">
                  Enviando {sendProgress.current} / {sendProgress.total}
                </p>
                {sendProgress.currentName && (
                  <p className="text-xs text-muted-foreground">
                    {sendProgress.currentName}...
                  </p>
                )}
              </div>
              <Progress
                value={(sendProgress.current / sendProgress.total) * 100}
                className="w-64 h-2"
              />

              {/* Live stats */}
              <div className="flex gap-4 text-xs">
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-3 w-3" /> {sendProgress.sent} enviados
                </span>
                {sendProgress.alreadyConnected > 0 && (
                  <span className="flex items-center gap-1 text-blue-600">
                    <LinkIcon className="h-3 w-3" /> {sendProgress.alreadyConnected} ya conectados
                  </span>
                )}
                {sendProgress.failed > 0 && (
                  <span className="flex items-center gap-1 text-red-500">
                    <XCircle className="h-3 w-3" /> {sendProgress.failed} fallidos
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ====== DONE PHASE ====== */}
          {phase === 'done' && (
            <div className="space-y-4">
              {/* Summary stats */}
              <div className={`grid gap-4 py-4 ${step.step_type === 'linkedin_connect' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div className="text-center">
                  <span className="text-3xl font-semibold text-green-600">
                    {sendResults.filter(r => r.status === 'sent').length}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">Enviados</p>
                </div>
                {step.step_type === 'linkedin_connect' && (
                  <div className="text-center">
                    <span className="text-3xl font-semibold text-blue-600">
                      {sendResults.filter(r => r.status === 'alreadyConnected').length}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">Ya conectados</p>
                  </div>
                )}
                <div className="text-center">
                  <span className="text-3xl font-semibold text-red-500">
                    {sendResults.filter(r => r.status === 'failed').length}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">Fallidos</p>
                </div>
              </div>

              {/* Per-lead results */}
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-1">
                  {sendResults.map((result) => (
                    <div key={result.leadId} className="flex items-center justify-between py-2 px-1">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          result.status === 'sent' ? 'bg-green-500'
                            : result.status === 'alreadyConnected' ? 'bg-blue-500'
                            : 'bg-red-500'
                        }`} />
                        <span className="text-sm">{result.leadName}</span>
                      </div>
                      <span className={`text-xs ${
                        result.status === 'sent' ? 'text-green-600'
                          : result.status === 'alreadyConnected' ? 'text-blue-600'
                          : 'text-red-500'
                      }`}>
                        {result.status === 'sent' && 'Enviado'}
                        {result.status === 'alreadyConnected' && 'Ya conectado'}
                        {result.status === 'failed' && 'Fallido'}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex justify-between items-center pt-2 border-t">
          <div>
            {phase === 'review' && genResults.some(r => r.error) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Los leads con error no se enviaran
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {phase === 'config' && (
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
            )}
            {phase === 'review' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSendAll}
                  disabled={sendableResults.length === 0}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Enviar todos ({sendableResults.length})
                </Button>
              </>
            )}
            {phase === 'done' && (
              <Button size="sm" onClick={handleDone}>
                Listo
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
