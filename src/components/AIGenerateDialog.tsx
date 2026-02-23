import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import {
  callEdgeFunction,
  type AIGenerateResponse,
  type AIProfileSummary,
  type AIResearchInsight,
  type AIPrompt,
  type QualityCheck,
  type ExampleSection,
  type ExampleMessage,
} from '@/lib/edge-functions'
import type { DetectedSignal } from '@/types/signals'
import { SIGNAL_CATEGORIES } from '@/types/signals'
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
import { Switch } from '@/components/ui/switch'
import { LLMModelSelector } from '@/components/LLMModelSelector'
import {
  Sparkles,
  Loader2,
  Copy,
  RefreshCw,
  Check,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ExternalLink,
  Search,
  Brain,
  User,
  Star,
  BookOpen,
  ArrowDownRight,
  MessageSquare,
  Shuffle,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'

interface AIGenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: string
  leadName: string
  stepType: 'linkedin_message' | 'linkedin_connect' | 'linkedin_comment' | 'send_email'
  postContext?: string
  onUseMessage: (message: string) => void
  onUseSubject?: (subject: string) => void
}

type Phase = 'idle' | 'researching' | 'generating' | 'done' | 'error'

type Tone = 'professional' | 'casual' | 'friendly'

const TONE_OPTIONS: Array<{ value: Tone; label: string }> = [
  { value: 'professional', label: 'Profesional' },
  { value: 'casual', label: 'Casual' },
  { value: 'friendly', label: 'Amigable' },
]

const STEP_TYPE_LABELS: Record<string, string> = {
  linkedin_message: 'Mensaje LinkedIn',
  linkedin_connect: 'Nota de conexion',
  linkedin_comment: 'Comentario',
  send_email: 'Email',
}

function getScoreColor(score: number): string {
  if (score >= 9) return 'bg-green-500 text-white'
  if (score >= 7) return 'bg-green-100 text-green-700 border-green-200'
  if (score >= 5) return 'bg-yellow-100 text-yellow-700 border-yellow-200'
  return 'bg-red-100 text-red-700 border-red-200'
}

function getScoreLabel(score: number): string {
  if (score >= 9) return 'Excelente'
  if (score >= 7) return 'Bueno'
  if (score >= 5) return 'Aceptable'
  return 'Mejorable'
}

export function AIGenerateDialog({
  open,
  onOpenChange,
  leadId,
  leadName,
  stepType,
  postContext,
  onUseMessage,
  onUseSubject,
}: AIGenerateDialogProps) {
  const { user, session } = useAuth()
  const { orgId } = useOrg()
  const [phase, setPhase] = useState<Phase>('idle')
  const [tone, setTone] = useState<Tone>('professional')
  const [selectedMessagePromptId, setSelectedMessagePromptId] = useState<string>('none')
  const [selectedResearchPromptId, setSelectedResearchPromptId] = useState<string>('none')
  const [customPrompt, setCustomPrompt] = useState('')
  const [generatedMessage, setGeneratedMessage] = useState('')
  const [generatedSubject, setGeneratedSubject] = useState('')
  const [profileSummary, setProfileSummary] = useState<AIProfileSummary | null>(null)
  const [webInsights, setWebInsights] = useState<AIResearchInsight[]>([])
  const [researchFailed, setResearchFailed] = useState(false)
  const [researchSummary, setResearchSummary] = useState<string | null>(null)
  const [qualityCheck, setQualityCheck] = useState<QualityCheck | null>(null)
  const [detectedSignals, setDetectedSignals] = useState<DetectedSignal[]>([])
  const [metadata, setMetadata] = useState<AIGenerateResponse['metadata'] | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [showResearch, setShowResearch] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedResearch, setCopiedResearch] = useState(false)
  const [selectedSectionId, setSelectedSectionId] = useState<string>('none')
  const [useSignals, setUseSignals] = useState(true)

  // Fetch message prompts for this step type
  const { data: messagePrompts = [] } = useQuery({
    queryKey: ['ai-prompts-message', orgId, stepType, user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('ai_prompts')
        .select('*')
        .eq('org_id', orgId!)
        .eq('owner_id', user.id)
        .eq('prompt_type', 'message')
        .eq('step_type', stepType)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as AIPrompt[]
    },
    enabled: !!user && !!orgId && open,
  })

  // Fetch research prompts
  const { data: researchPrompts = [] } = useQuery({
    queryKey: ['ai-prompts-research', orgId, user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('ai_prompts')
        .select('*')
        .eq('org_id', orgId!)
        .eq('owner_id', user.id)
        .eq('prompt_type', 'research')
        .order('is_default', { ascending: false })
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as AIPrompt[]
    },
    enabled: !!user && !!orgId && open,
  })

  // Fetch example sections
  const { data: exampleSections = [] } = useQuery({
    queryKey: ['example-sections', orgId, user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('example_sections')
        .select('*')
        .eq('org_id', orgId!)
        .eq('owner_id', user.id)
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as ExampleSection[]
    },
    enabled: !!user && !!orgId && open,
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

  // Auto-select default message prompt
  useEffect(() => {
    if (messagePrompts.length > 0 && selectedMessagePromptId === 'none') {
      const defaultPrompt = messagePrompts.find(p => p.is_default)
      if (defaultPrompt) {
        setSelectedMessagePromptId(defaultPrompt.id)
        setTone(defaultPrompt.tone)
      }
    }
  }, [messagePrompts])

  // Auto-select default research prompt
  useEffect(() => {
    if (researchPrompts.length > 0 && selectedResearchPromptId === 'none') {
      const defaultPrompt = researchPrompts.find(p => p.is_default)
      if (defaultPrompt) {
        setSelectedResearchPromptId(defaultPrompt.id)
      }
    }
  }, [researchPrompts])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setPhase('idle')
      setGeneratedMessage('')
      setGeneratedSubject('')
      setProfileSummary(null)
      setWebInsights([])
      setResearchFailed(false)
      setResearchSummary(null)
      setQualityCheck(null)
      setDetectedSignals([])
      setMetadata(null)
      setErrorMsg('')
      setShowResearch(false)
      setShowConfig(false)
      setCopied(false)
      setCopiedResearch(false)
      setSelectedMessagePromptId('none')
      setSelectedResearchPromptId('none')
      setSelectedSectionId('none')
      setCustomPrompt('')
    }
  }, [open])

  const getActiveMessagePrompt = (): AIPrompt | undefined => {
    if (selectedMessagePromptId && selectedMessagePromptId !== 'none') {
      return messagePrompts.find(p => p.id === selectedMessagePromptId)
    }
    return undefined
  }

  const getActiveMessagePromptBody = (): string | undefined => {
    const prompt = getActiveMessagePrompt()
    if (prompt) {
      if (customPrompt.trim()) {
        return `${prompt.prompt_body}\n\n## Instrucciones adicionales:\n${customPrompt}`
      }
      return prompt.prompt_body
    }
    return customPrompt || undefined
  }

  const getActiveResearchPromptBody = (): string | undefined => {
    if (selectedResearchPromptId && selectedResearchPromptId !== 'none') {
      const prompt = researchPrompts.find(p => p.id === selectedResearchPromptId)
      return prompt?.prompt_body
    }
    return undefined
  }

  const doGenerate = async (regenerateHint?: 'shorter' | 'more_casual' | 'different_angle' | null) => {
    if (!session?.access_token) {
      setErrorMsg('No hay sesion activa')
      setPhase('error')
      return
    }

    setPhase('researching')
    setErrorMsg('')
    setCopied(false)
    setQualityCheck(null)

    try {
      const messageTemplate = getActiveMessagePromptBody()
      const researchPromptBody = getActiveResearchPromptBody()
      const activePrompt = getActiveMessagePrompt()
      const language = activePrompt?.language || 'es'

      await new Promise(r => setTimeout(r, 300))
      setPhase('generating')

      const exampleMessageBodies = sectionMessages.length > 0
        ? sectionMessages.map(m => m.body)
        : undefined

      const exampleNotes = sectionMessages.length > 0
        ? sectionMessages.map(m => m.quality_note || '')
        : undefined

      // Build request with new structured fields
      const requestBody: Record<string, unknown> = {
        leadId,
        stepType,
        messageTemplate,
        researchPrompt: researchPromptBody,
        tone,
        language,
        postContext,
        exampleMessages: exampleMessageBodies,
        exampleNotes,
        customInstructions: customPrompt || undefined,
        useSignals,
      }

      // Add structured fields from the selected prompt
      if (activePrompt) {
        if (activePrompt.objective) requestBody.objective = activePrompt.objective
        if (activePrompt.structure) requestBody.structure = activePrompt.structure
        if (activePrompt.writing_principles?.length > 0) requestBody.writingPrinciples = activePrompt.writing_principles
        if (activePrompt.anti_patterns?.length > 0) requestBody.antiPatterns = activePrompt.anti_patterns
      }

      // Add regeneration hint
      if (regenerateHint) requestBody.regenerateHint = regenerateHint

      const result = await callEdgeFunction<AIGenerateResponse>(
        'ai-research-generate',
        requestBody,
        session.access_token,
        { timeoutMs: 120000 } // 2 min: research + up to 5 LLM calls
      )

      if (result.success) {
        setGeneratedMessage(result.generatedMessage)
        setGeneratedSubject(result.generatedSubject || '')
        setProfileSummary(result.research.profileSummary)
        setWebInsights(result.research.webInsights)
        setResearchFailed(result.research.researchFailed)
        setResearchSummary(result.research.researchSummary)
        setQualityCheck(result.qualityCheck || null)
        setDetectedSignals(result.detectedSignals || [])
        setMetadata(result.metadata)
        setPhase('done')
      } else {
        setErrorMsg('La generacion fallo. Intenta de nuevo.')
        setPhase('error')
      }
    } catch (err) {
      console.error('AI generate error:', err)
      setErrorMsg(err instanceof Error ? err.message : 'Error al generar mensaje')
      setPhase('error')
    }
  }

  const handleGenerate = () => doGenerate()

  const handleRegenerate = (hint?: 'shorter' | 'more_casual' | 'different_angle') => {
    doGenerate(hint || null)
  }

  const handleMessagePromptChange = (promptId: string) => {
    setSelectedMessagePromptId(promptId)
    if (promptId !== 'none') {
      const prompt = messagePrompts.find(p => p.id === promptId)
      if (prompt) {
        setTone(prompt.tone)
      }
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedMessage)
      setCopied(true)
      toast.success('Mensaje copiado')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  const handleUseMessage = () => {
    onUseMessage(generatedMessage)
    if (generatedSubject && onUseSubject) {
      onUseSubject(generatedSubject)
    }
    toast.success('Mensaje insertado')
  }

  const isEmailStep = stepType === 'send_email'
  const isLoading = phase === 'researching' || phase === 'generating'

  // Determine active config for display
  const activeMessagePrompt = getActiveMessagePrompt()
  const activeResearchPrompt = selectedResearchPromptId !== 'none'
    ? researchPrompts.find(p => p.id === selectedResearchPromptId)
    : undefined
  const activeSection = selectedSectionId !== 'none'
    ? exampleSections.find(s => s.id === selectedSectionId)
    : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Message Generator
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
          {/* Lead info & step type */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{leadName}</span>
              <Badge variant="outline" className="text-xs">
                {STEP_TYPE_LABELS[stepType] || stepType}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {metadata && (
                <span className="text-xs text-muted-foreground">
                  {(metadata.totalTimeMs / 1000).toFixed(1)}s
                </span>
              )}
              {/* Human Score Badge */}
              {qualityCheck && (
                <Badge className={`text-xs font-semibold ${getScoreColor(qualityCheck.humanScore)}`}>
                  {qualityCheck.humanScore}/10 — {getScoreLabel(qualityCheck.humanScore)}
                </Badge>
              )}
            </div>
          </div>

          {/* Active config summary (collapsed view) */}
          <div className="space-y-2">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              {showConfig ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span>Configuracion</span>
              {/* Config tags summary */}
              <div className="flex flex-wrap gap-1 ml-2">
                {activeMessagePrompt && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    <MessageSquare className="h-3 w-3 mr-0.5" />
                    {activeMessagePrompt.name}
                  </Badge>
                )}
                {activeResearchPrompt && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    <Search className="h-3 w-3 mr-0.5" />
                    {activeResearchPrompt.name}
                  </Badge>
                )}
                {activeSection && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    <BookOpen className="h-3 w-3 mr-0.5" />
                    {activeSection.name}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-[10px] h-5">
                  {TONE_OPTIONS.find(t => t.value === tone)?.label}
                </Badge>
                {useSignals && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    <Zap className="h-3 w-3 mr-0.5 text-amber-500" />
                    Señales
                  </Badge>
                )}
              </div>
            </button>

            {showConfig && (
              <div className="space-y-3 pl-5 pb-2 border-l-2 border-muted ml-2">
                {/* Research Prompt selector */}
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">
                    Prompt de Investigacion
                  </label>
                  <Select
                    value={selectedResearchPromptId}
                    onValueChange={setSelectedResearchPromptId}
                    disabled={isLoading}
                  >
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

                {/* Message Prompt selector */}
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">
                    Prompt de Mensaje
                  </label>
                  <Select
                    value={selectedMessagePromptId}
                    onValueChange={handleMessagePromptChange}
                    disabled={isLoading}
                  >
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

                {/* Example Section selector */}
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">
                    <BookOpen className="inline h-3.5 w-3.5 mr-1" />
                    Referencias
                  </label>
                  <Select
                    value={selectedSectionId}
                    onValueChange={setSelectedSectionId}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="No usar ninguno" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No usar ninguno</SelectItem>
                      {exampleSections.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedSectionId !== 'none' && sectionMessages.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {sectionMessages.length} {sectionMessages.length === 1 ? 'mensaje' : 'mensajes'} de referencia
                    </p>
                  )}
                </div>

                {/* Tone selector */}
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
                        disabled={isLoading}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Signals toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />
                    <span className="text-sm text-muted-foreground">Señales de venta</span>
                  </div>
                  <Switch
                    checked={useSignals}
                    onCheckedChange={setUseSignals}
                    disabled={isLoading}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Custom instructions (always visible, optional) */}
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">
              {selectedMessagePromptId !== 'none'
                ? 'Instrucciones adicionales (se agregan al prompt)'
                : 'Instrucciones (opcional)'}
            </label>
            <Textarea
              placeholder={
                selectedMessagePromptId !== 'none'
                  ? 'Ej: Para este lead en particular, enfocate en su experiencia en fintech...'
                  : 'Ej: Menciona que vi su post sobre IA y propone una llamada de 15 min...'
              }
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={2}
              className="text-sm resize-none"
              disabled={isLoading}
            />
          </div>

          {/* Idle state - Generate button */}
          {phase === 'idle' && (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <Sparkles className="h-10 w-10 text-purple-200" />
              <p className="text-sm text-muted-foreground text-center">
                Selecciona tus prompts y haz click en Generar
              </p>
              <div className="flex items-center gap-2">
                <Button onClick={handleGenerate}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generar mensaje
                </Button>
                <LLMModelSelector />
              </div>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              <div className="text-center">
                <p className="text-sm font-medium">
                  {phase === 'researching' ? (
                    <>
                      <Search className="inline h-4 w-4 mr-1" />
                      Investigando a {leadName}...
                    </>
                  ) : (
                    <>
                      <Brain className="inline h-4 w-4 mr-1" />
                      Generando mensaje personalizado...
                    </>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Esto puede tomar 10-20 segundos
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {phase === 'error' && (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-destructive text-center">{errorMsg}</p>
              <Button variant="outline" size="sm" onClick={handleGenerate}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reintentar
              </Button>
            </div>
          )}

          {/* Generated message */}
          {phase === 'done' && (
              <div className="space-y-4">
                {/* Subject field for email steps */}
                {isEmailStep && (
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Asunto generado
                    </label>
                    <Input
                      value={generatedSubject}
                      onChange={(e) => setGeneratedSubject(e.target.value)}
                      placeholder="Asunto del email..."
                      className="text-sm"
                    />
                  </div>
                )}

                {/* Message textarea */}
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    {isEmailStep ? 'Cuerpo del email' : 'Mensaje generado'}
                  </label>
                  <Textarea
                    value={generatedMessage}
                    onChange={(e) => setGeneratedMessage(e.target.value)}
                    rows={6}
                    className="text-sm"
                  />
                  {stepType === 'linkedin_connect' && generatedMessage.length > 300 && (
                    <p className="text-xs text-destructive mt-1">
                      {generatedMessage.length}/300 caracteres (excede el limite)
                    </p>
                  )}
                </div>

                {/* Quality check feedback */}
                {qualityCheck && qualityCheck.issues.length > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Feedback de calidad:</p>
                    {qualityCheck.issues.map((issue, i) => (
                      <p key={i} className="text-xs text-muted-foreground">• {issue}</p>
                    ))}
                    {qualityCheck.suggestion && (
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                        Sugerencia: {qualityCheck.suggestion}
                      </p>
                    )}
                  </div>
                )}

                {/* Detected signals */}
                {detectedSignals.length > 0 && (
                  <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        {detectedSignals.length} {detectedSignals.length === 1 ? 'señal detectada' : 'señales detectadas'}
                      </span>
                      {metadata?.signalsSearchTimeMs && (
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {(metadata.signalsSearchTimeMs / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {detectedSignals.map((signal, i) => {
                        const catMeta = SIGNAL_CATEGORIES[signal.category]
                        return (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <Badge
                              variant="outline"
                              className={`text-[10px] shrink-0 ${catMeta?.color || ''}`}
                            >
                              {catMeta?.label || signal.category}
                            </Badge>
                            <span className="text-muted-foreground leading-relaxed">
                              <span className="font-medium text-foreground">{signal.signalName}:</span>{' '}
                              {signal.summary}
                              {signal.sourceUrl && (
                                <a
                                  href={signal.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-1 text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center"
                                >
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Contextual regeneration buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleRegenerate('shorter')}>
                    <ArrowDownRight className="mr-1 h-3 w-3" />
                    Mas corto
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleRegenerate('more_casual')}>
                    <MessageSquare className="mr-1 h-3 w-3" />
                    Mas casual
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleRegenerate('different_angle')}>
                    <Shuffle className="mr-1 h-3 w-3" />
                    Otro angulo
                  </Button>
                </div>

                {/* Research warning */}
                {researchFailed && (
                  <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded text-xs text-yellow-700 dark:text-yellow-300">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    La investigacion web no estuvo disponible. El mensaje se genero solo con datos de LinkedIn.
                  </div>
                )}

                {/* Research insights */}
                <div className="space-y-2">
                  <button
                    onClick={() => setShowResearch(!showResearch)}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showResearch ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    Research Insights
                    {metadata && (
                      <Badge variant="secondary" className="ml-1 text-xs h-5">
                        {metadata.totalInsights} fuentes
                      </Badge>
                    )}
                  </button>

                  {showResearch && (
                    <div className="space-y-3 pl-5">
                      {/* AI Research Summary */}
                      {researchSummary && (
                        <div className="rounded-lg border bg-muted/40 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <Brain className="h-3.5 w-3.5 text-purple-500" />
                              <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">Resumen de Investigacion</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(researchSummary)
                                  setCopiedResearch(true)
                                  toast.success('Research copiado')
                                  setTimeout(() => setCopiedResearch(false), 2000)
                                } catch {
                                  toast.error('No se pudo copiar')
                                }
                              }}
                            >
                              {copiedResearch ? (
                                <Check className="mr-1 h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="mr-1 h-3 w-3" />
                              )}
                              {copiedResearch ? 'Copiado' : 'Copiar'}
                            </Button>
                          </div>
                          <div className="text-sm leading-relaxed prose prose-sm prose-neutral dark:prose-invert max-w-none prose-headings:text-sm prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                            <ReactMarkdown>{researchSummary}</ReactMarkdown>
                          </div>
                        </div>
                      )}

                      {/* LinkedIn profile data */}
                      {profileSummary && (
                        <div className="text-xs space-y-1">
                          <p className="font-medium text-muted-foreground">Perfil LinkedIn</p>
                          <p>{profileSummary.name} &mdash; {profileSummary.headline}</p>
                          {profileSummary.company && <p>Empresa: {profileSummary.company}</p>}
                          {profileSummary.recentPosts.length > 0 && (
                            <p>{profileSummary.recentPosts.length} posts recientes encontrados</p>
                          )}
                        </div>
                      )}

                      {/* Web sources */}
                      {webInsights.length > 0 && (
                        <div className="text-xs space-y-2">
                          <p className="font-medium text-muted-foreground">Fuentes web</p>
                          {webInsights.map((insight, i) => (
                            <div key={i} className="border rounded p-2 space-y-1">
                              <a
                                href={insight.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                              >
                                {insight.title}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                              <p className="text-muted-foreground">{insight.snippet}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {webInsights.length === 0 && !researchFailed && (
                        <p className="text-xs text-muted-foreground">
                          No se encontraron fuentes web relevantes.
                        </p>
                      )}

                      {metadata && (
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <p>Research: {(metadata.researchTimeMs / 1000).toFixed(1)}s | Generacion: {(metadata.generationTimeMs / 1000).toFixed(1)}s</p>
                          <p>Fuentes: {metadata.sourcesUsed.join(', ')}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex justify-between items-center pt-2 border-t">
          <div className="flex gap-2">
            {phase === 'done' && (
              <>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <Check className="mr-2 h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleRegenerate()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerar
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {phase === 'done' && (
              <Button size="sm" onClick={handleUseMessage}>
                <Sparkles className="mr-2 h-4 w-4" />
                Usar mensaje
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
