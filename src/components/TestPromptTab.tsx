import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import {
  callEdgeFunction,
  type AIGenerateResponse,
  type AIPrompt,
  type QualityCheck,
} from '@/lib/edge-functions'
import type { DetectedSignal } from '@/types/signals'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Sparkles,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  MessageSquare,
  UserPlus,
  MessageCircle,
  Mail,
  User,
  Search,
  Brain,
  BookOpen,
  Zap,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Shuffle,
  ArrowDownRight,
  SendHorizonal,
  Bot,
  Save,
  WandSparkles,
  Reply,
  Cpu,
} from 'lucide-react'
import { toast } from 'sonner'

type StepType = 'linkedin_message' | 'linkedin_connect' | 'linkedin_comment' | 'send_email' | 'email_reply'
type Tone = 'professional' | 'casual' | 'friendly'
type Phase = 'idle' | 'generating' | 'done' | 'error'

interface ChangePlan {
  add: string[]
  remove: string[]
  modify: string[]
  reasoning: string
}

interface RefinePromptResponse {
  success: boolean
  refinedPrompt: string
  changes: ChangePlan
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  proposedPrompt?: string   // Only on assistant messages with a prompt proposal
  changes?: ChangePlan      // Structured change plan from Agent 1
  isApplied?: boolean       // If this proposal was already saved to DB
}

const STEP_TYPES: Array<{ value: StepType; label: string; icon: React.ElementType; color: string }> = [
  { value: 'linkedin_message', label: 'LinkedIn Message', icon: MessageSquare, color: 'bg-sky-100 text-sky-700 border-sky-200' },
  { value: 'linkedin_connect', label: 'LinkedIn Connect', icon: UserPlus, color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  { value: 'linkedin_comment', label: 'LinkedIn Comment', icon: MessageCircle, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'send_email', label: 'Email', icon: Mail, color: 'bg-violet-100 text-violet-700 border-violet-200' },
  { value: 'email_reply', label: 'Email Follow-up', icon: Reply, color: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200' },
]

const TONE_OPTIONS: Array<{ value: Tone; label: string }> = [
  { value: 'professional', label: 'Profesional' },
  { value: 'casual', label: 'Casual' },
  { value: 'friendly', label: 'Amigable' },
]

const MODEL_OPTIONS: Array<{ value: string; label: string; provider: 'anthropic' | 'openai' | null; badge?: string }> = [
  { value: 'default', label: 'Default (configuración del perfil)', provider: null },
  // Anthropic
  { value: 'anthropic:claude-opus-4-6',          label: 'Claude Opus 4.6',    provider: 'anthropic', badge: 'Mejor' },
  { value: 'anthropic:claude-sonnet-4-6',         label: 'Claude Sonnet 4.6',  provider: 'anthropic', badge: 'Balanceado' },
  { value: 'anthropic:claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',   provider: 'anthropic', badge: 'Rapido' },
  // OpenAI
  { value: 'openai:gpt-4o',     label: 'GPT-4o',       provider: 'openai', badge: 'Balanceado' },
  { value: 'openai:gpt-4o-mini', label: 'GPT-4o Mini',  provider: 'openai', badge: 'Rapido' },
  { value: 'openai:gpt-5',      label: 'GPT-5',        provider: 'openai', badge: 'Mejor' },
  { value: 'openai:gpt-5-mini', label: 'GPT-5 Mini',   provider: 'openai' },
]

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

interface LeadResult {
  id: string
  first_name: string | null
  last_name: string | null
  company: string | null
  title: string | null
  email: string | null
}

export function TestPromptTab() {
  const { session } = useAuth()
  const { orgId } = useOrg()
  const queryClient = useQueryClient()

  // Config state
  const [stepType, setStepType] = useState<StepType>('linkedin_message')
  const [selectedMessagePromptId, setSelectedMessagePromptId] = useState<string>('none')
  const [selectedSectionId, setSelectedSectionId] = useState<string>('none')
  const [selectedModel, setSelectedModel] = useState<string>('default')
  const [selectedLeadId, setSelectedLeadId] = useState<string>('')
  const [tone, setTone] = useState<Tone>('professional')
  const [useSignals, setUseSignals] = useState(true)
  const [customInstructions, setCustomInstructions] = useState('')
  const [leadSearch, setLeadSearch] = useState('')
  const [showLeadResults, setShowLeadResults] = useState(false)

  // Result state
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [generatedMessage, setGeneratedMessage] = useState('')
  const [generatedSubject, setGeneratedSubject] = useState('')
  const [qualityCheck, setQualityCheck] = useState<QualityCheck | null>(null)
  const [detectedSignals, setDetectedSignals] = useState<DetectedSignal[]>([])
  const [researchSummary, setResearchSummary] = useState<string | null>(null)
  const [researchFailed, setResearchFailed] = useState(false)
  const [metadata, setMetadata] = useState<AIGenerateResponse['metadata'] | null>(null)
  const [copied, setCopied] = useState(false)
  const [showResearch, setShowResearch] = useState(false)
  const [selectedLead, setSelectedLead] = useState<LeadResult | null>(null)

  // Chat / iterate state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [applyingChat, setApplyingChat] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    proposedPrompt: string
    messageIndex: number
  }>({ open: false, proposedPrompt: '', messageIndex: -1 })
  const [savingPrompt, setSavingPrompt] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Fetch all prompts
  const { data: allPrompts = [] } = useQuery({
    queryKey: ['ai-prompts-test', orgId, session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id || !orgId) return []
      const { data } = await supabase
        .from('ai_prompts')
        .select('*')
        .eq('org_id', orgId)
        .order('is_default', { ascending: false })
      return (data || []) as AIPrompt[]
    },
    enabled: !!session?.user?.id && !!orgId,
  })

  const messagePrompts = allPrompts.filter(p => p.prompt_type === 'message' && (p.step_type === stepType || p.step_type === null))

  // Fetch example sections
  const { data: exampleSections = [] } = useQuery({
    queryKey: ['example-sections-test', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return []
      const { data } = await supabase
        .from('example_sections')
        .select('id, name')
        .eq('owner_id', session.user.id)
        .order('created_at', { ascending: true })
      return data || []
    },
    enabled: !!session?.user?.id,
  })

  // Lead search
  const { data: leadResults = [] } = useQuery({
    queryKey: ['lead-search-test', orgId, leadSearch],
    queryFn: async () => {
      if (!orgId || leadSearch.trim().length < 2) return []
      const { data } = await supabase
        .from('leads')
        .select('id, first_name, last_name, company, title, email')
        .eq('org_id', orgId)
        .or(`first_name.ilike.%${leadSearch}%,last_name.ilike.%${leadSearch}%,company.ilike.%${leadSearch}%,email.ilike.%${leadSearch}%`)
        .limit(8)
      return (data || []) as LeadResult[]
    },
    enabled: !!orgId && leadSearch.trim().length >= 2,
  })

  // Fetch example messages for selected section
  const { data: sectionMessages = [] } = useQuery({
    queryKey: ['section-messages-test', selectedSectionId],
    queryFn: async () => {
      if (!selectedSectionId || selectedSectionId === 'none') return []
      const { data } = await supabase
        .from('example_messages')
        .select('body, quality_note')
        .eq('section_id', selectedSectionId)
        .order('sort_order', { ascending: true })
      return data || []
    },
    enabled: !!selectedSectionId && selectedSectionId !== 'none',
  })

  const handleSelectLead = (lead: LeadResult) => {
    setSelectedLead(lead)
    setSelectedLeadId(lead.id)
    const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email || 'Lead'
    setLeadSearch(name + (lead.company ? ` — ${lead.company}` : ''))
    setShowLeadResults(false)
  }

  const handleStepTypeChange = (newType: StepType) => {
    setStepType(newType)
    if (selectedMessagePromptId !== 'none') {
      const prompt = allPrompts.find(p => p.id === selectedMessagePromptId)
      if (prompt && prompt.step_type && prompt.step_type !== newType) {
        setSelectedMessagePromptId('none')
      }
    }
  }

  const doGenerate = async (regenerateHint?: 'shorter' | 'more_casual' | 'different_angle', overrideCustomInstructions?: string) => {
    if (!session?.access_token) {
      toast.error('No hay sesion activa')
      return
    }
    if (!selectedLeadId) {
      toast.error('Selecciona un lead para el test')
      return
    }

    setPhase('generating')
    setErrorMsg('')
    setCopied(false)

    try {
      const activePrompt = selectedMessagePromptId !== 'none'
        ? allPrompts.find(p => p.id === selectedMessagePromptId)
        : undefined

      const exampleMessageBodies = sectionMessages.length > 0
        ? sectionMessages.map(m => m.body)
        : undefined
      const exampleNotes = sectionMessages.length > 0
        ? sectionMessages.map(m => m.quality_note || '')
        : undefined

      const [modelProvider, modelId] = selectedModel !== 'default'
        ? selectedModel.split(':')
        : [undefined, undefined]

      const requestBody: Record<string, unknown> = {
        leadId: selectedLeadId,
        stepType,
        messageTemplate: activePrompt?.prompt_body || undefined,
        tone,
        language: activePrompt?.language || 'es',
        exampleMessages: exampleMessageBodies,
        exampleNotes,
        customInstructions: overrideCustomInstructions ?? (customInstructions || undefined),
        useSignals,
        ...(modelProvider && modelId ? { llmProvider: modelProvider, llmModel: modelId } : {}),
      }

      if (activePrompt) {
        if (activePrompt.objective) requestBody.objective = activePrompt.objective
        if (activePrompt.structure) requestBody.structure = activePrompt.structure
        if (activePrompt.writing_principles?.length > 0) requestBody.writingPrinciples = activePrompt.writing_principles
        if (activePrompt.anti_patterns?.length > 0) requestBody.antiPatterns = activePrompt.anti_patterns
      }

      if (regenerateHint) requestBody.regenerateHint = regenerateHint

      const result = await callEdgeFunction<AIGenerateResponse>(
        'ai-research-generate',
        requestBody,
        session.access_token,
        { timeoutMs: 120000 }
      )

      if (result.success) {
        setGeneratedMessage(result.generatedMessage)
        setGeneratedSubject(result.generatedSubject || '')
        setResearchSummary(result.research.researchSummary)
        setResearchFailed(result.research.researchFailed)
        setQualityCheck(result.qualityCheck || null)
        setDetectedSignals(result.detectedSignals || [])
        setMetadata(result.metadata)
        setPhase('done')
      } else {
        setErrorMsg('La generacion fallo. Intenta de nuevo.')
        setPhase('error')
      }
    } catch (err) {
      console.error('AI test generate error:', err)
      setErrorMsg(err instanceof Error ? err.message : 'Error al generar mensaje')
      setPhase('error')
    }
  }

  // Chat: send feedback → multi-agent refinement (Agent 1: analyze, Agent 2: refine)
  const handleChatSend = async () => {
    const feedback = chatInput.trim()
    if (!feedback || applyingChat) return

    const activePrompt = selectedMessagePromptId !== 'none'
      ? allPrompts.find(p => p.id === selectedMessagePromptId)
      : undefined

    // Add user message to chat
    const userMsg: ChatMessage = { role: 'user', content: feedback }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setApplyingChat(true)

    try {
      if (!session?.access_token) throw new Error('No hay sesion activa')

      if (!activePrompt) {
        // No prompt selected — regenerate using feedback as custom instructions only
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: 'No hay un prompt de mensaje seleccionado. Aplicare tu feedback como instruccion directa y regenerare el mensaje.',
        }
        setChatMessages(prev => [...prev, assistantMsg])
        setApplyingChat(false)
        await doGenerate(undefined, feedback)
        return
      }

      // Call ai-refine-prompt: multi-agent (analyze → plan → refine)
      const result = await callEdgeFunction<RefinePromptResponse>(
        'ai-refine-prompt',
        {
          currentPrompt: activePrompt.prompt_body,
          userFeedback: feedback,
          generatedMessage: generatedMessage || undefined,
          stepType: activePrompt.step_type || stepType,
          tone: activePrompt.tone || tone,
          language: activePrompt.language || 'es',
        },
        session.access_token,
        { timeoutMs: 60000 }
      )

      if (!result.success || !result.refinedPrompt) {
        throw new Error('No se pudo refinar el prompt')
      }

      const { changes } = result
      const totalChanges = changes.add.length + changes.remove.length + changes.modify.length

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: totalChanges > 0
          ? `Aqui esta el prompt refinado. Analice el prompt original, identifique la causa del problema y aplique los cambios de forma quirurgica.`
          : `No encontre cambios especificos necesarios en el prompt. ${changes.reasoning}`,
        proposedPrompt: totalChanges > 0 ? result.refinedPrompt : undefined,
        changes: totalChanges > 0 ? changes : undefined,
      }
      setChatMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: `Error al analizar el prompt: ${err instanceof Error ? err.message : 'Error desconocido'}`,
      }
      setChatMessages(prev => [...prev, assistantMsg])
    } finally {
      setApplyingChat(false)
    }
  }

  // Show confirmation dialog before saving prompt changes
  const handleRequestApply = (proposedPrompt: string, msgIndex: number) => {
    setConfirmDialog({ open: true, proposedPrompt, messageIndex: msgIndex })
  }

  // Save proposed prompt to DB and regenerate
  const handleConfirmApply = async () => {
    const { proposedPrompt, messageIndex } = confirmDialog
    const activePrompt = allPrompts.find(p => p.id === selectedMessagePromptId)
    if (!activePrompt) return

    setSavingPrompt(true)
    try {
      const { error } = await supabase
        .from('ai_prompts')
        .update({ prompt_body: proposedPrompt, updated_at: new Date().toISOString() })
        .eq('id', activePrompt.id)

      if (error) throw error

      // Mark message as applied
      setChatMessages(prev => prev.map((m, i) =>
        i === messageIndex ? { ...m, isApplied: true } : m
      ))

      // Refresh prompts cache
      await queryClient.invalidateQueries({ queryKey: ['ai-prompts-test'] })
      await queryClient.invalidateQueries({ queryKey: ['ai-prompts'] })

      setConfirmDialog({ open: false, proposedPrompt: '', messageIndex: -1 })
      toast.success(`Prompt "${activePrompt.name}" actualizado`)

      // Regenerate with updated prompt (the prompt will be refetched from cache)
      setTimeout(() => doGenerate(), 200)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el prompt')
    } finally {
      setSavingPrompt(false)
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

  const isLoading = phase === 'generating'
  const isEmail = stepType === 'send_email'
  const activePrompt = selectedMessagePromptId !== 'none'
    ? allPrompts.find(p => p.id === selectedMessagePromptId)
    : undefined

  return (
    <div className="space-y-6 mt-4">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          Probar Generacion de Mensajes
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Selecciona un tipo de mensaje, los prompts a utilizar y un lead real para testear la generacion.
          Usa el chat para iterar y mejorar los prompts.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ─────────────── LEFT PANEL — Configuration ─────────────── */}
        <div className="space-y-5">
          {/* Step type selector */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Tipo de Paso
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {STEP_TYPES.map(({ value, label, icon: Icon, color }) => (
                <button
                  key={value}
                  onClick={() => handleStepTypeChange(value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all
                    ${stepType === value
                      ? `${color} border-current shadow-sm`
                      : 'bg-background text-muted-foreground border-border hover:border-foreground/30'
                    }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Lead selector */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Lead de Prueba
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <Input
                  placeholder="Buscar por nombre, empresa o email..."
                  value={leadSearch}
                  onChange={e => {
                    setLeadSearch(e.target.value)
                    if (selectedLead) {
                      setSelectedLeadId('')
                      setSelectedLead(null)
                    }
                    setShowLeadResults(true)
                  }}
                  onFocus={() => setShowLeadResults(true)}
                  onBlur={() => setTimeout(() => setShowLeadResults(false), 150)}
                />
              </div>
              {selectedLead && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{[selectedLead.first_name, selectedLead.last_name].filter(Boolean).join(' ')}</span>
                  {selectedLead.title && <span className="text-muted-foreground">· {selectedLead.title}</span>}
                  {selectedLead.company && <Badge variant="secondary" className="text-xs">{selectedLead.company}</Badge>}
                </div>
              )}
              {showLeadResults && leadResults.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-popover border rounded-md shadow-md overflow-hidden">
                  {leadResults.map(lead => (
                    <button
                      key={lead.id}
                      className="w-full flex items-start gap-2 px-3 py-2.5 hover:bg-accent text-left text-sm"
                      onMouseDown={() => handleSelectLead(lead)}
                    >
                      <User className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-medium">
                          {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[lead.title, lead.company].filter(Boolean).join(' · ')}
                          {lead.email && <span className="ml-1 opacity-70">· {lead.email}</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Prompt selectors */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Prompts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Prompt */}
              <div>
                <Label className="flex items-center gap-1.5 mb-1.5 text-sm">
                  <Brain className="h-3.5 w-3.5 text-purple-500" />
                  Prompt
                </Label>
                <Select value={selectedMessagePromptId} onValueChange={setSelectedMessagePromptId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Sin prompt (default)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin prompt (default del sistema)</SelectItem>
                    {messagePrompts.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <span>{p.name}</span>
                          {p.is_default && <Badge variant="secondary" className="text-[10px] h-4">Default</Badge>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activePrompt && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {activePrompt.tone && <Badge variant="outline" className="text-[10px]">{activePrompt.tone}</Badge>}
                    {activePrompt.objective && <Badge variant="outline" className="text-[10px]">{activePrompt.objective}</Badge>}
                    {activePrompt.language && <Badge variant="outline" className="text-[10px]">{activePrompt.language.toUpperCase()}</Badge>}
                  </div>
                )}
              </div>

              {/* Example Section */}
              <div>
                <Label className="flex items-center gap-1.5 mb-1.5 text-sm">
                  <BookOpen className="h-3.5 w-3.5 text-amber-500" />
                  Seccion de Ejemplos
                </Label>
                <Select value={selectedSectionId} onValueChange={setSelectedSectionId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Sin ejemplos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin ejemplos</SelectItem>
                    {exampleSections.map((s: { id: string; name: string }) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Model */}
              <div>
                <Label className="flex items-center gap-1.5 mb-1.5 text-sm">
                  <Cpu className="h-3.5 w-3.5 text-indigo-500" />
                  Modelo de IA
                </Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Default (perfil)" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map(m => (
                      <SelectItem key={m.value} value={m.value}>
                        <div className="flex items-center gap-2">
                          {m.provider === 'anthropic' && (
                            <span className="text-[9px] font-semibold text-orange-600 bg-orange-100 px-1 rounded">Claude</span>
                          )}
                          {m.provider === 'openai' && (
                            <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-100 px-1 rounded">OpenAI</span>
                          )}
                          <span>{m.label}</span>
                          {m.badge && (
                            <span className="text-[9px] text-muted-foreground">· {m.badge}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tone */}
              <div>
                <Label className="text-sm mb-1.5 block">Tono</Label>
                <div className="flex gap-2">
                  {TONE_OPTIONS.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setTone(t.value)}
                      className={`flex-1 py-1.5 px-2 rounded border text-xs font-medium transition-all
                        ${tone === t.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-foreground/30'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Signals toggle */}
              <div className="flex items-center justify-between py-1">
                <Label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  Usar Señales de Actividad
                </Label>
                <Switch checked={useSignals} onCheckedChange={setUseSignals} />
              </div>
            </CardContent>
          </Card>

          {/* Custom instructions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Instrucciones Adicionales (opcional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Ej: Menciona que somos de la misma industria..."
                value={customInstructions}
                onChange={e => setCustomInstructions(e.target.value)}
                className="min-h-[80px] text-sm resize-none"
              />
            </CardContent>
          </Card>

          {/* Generate button */}
          <Button
            onClick={() => doGenerate()}
            disabled={isLoading || !selectedLeadId}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generar Mensaje de Prueba
              </>
            )}
          </Button>
        </div>

        {/* ─────────────── RIGHT PANEL — Output + Chat ─────────────── */}
        <div className="space-y-4">
          {/* Empty state */}
          {phase === 'idle' && chatMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground border-2 border-dashed rounded-xl">
              <Sparkles className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">El mensaje generado aparecera aqui</p>
              <p className="text-xs mt-1 opacity-70">Selecciona un lead y haz click en Generar</p>
            </div>
          )}

          {/* Loading */}
          {phase === 'generating' && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-purple-500 mb-4" />
              <p className="text-sm font-medium">Investigando y generando...</p>
              <p className="text-xs text-muted-foreground mt-1">Esto puede tomar hasta 30-60 segundos</p>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="flex flex-col items-center justify-center h-64 text-center text-destructive border-2 border-dashed border-destructive/30 rounded-xl">
              <AlertTriangle className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm font-medium">Error al generar</p>
              <p className="text-xs mt-1 opacity-70 max-w-xs">{errorMsg}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setPhase('idle')}>
                Intentar de nuevo
              </Button>
            </div>
          )}

          {/* Result */}
          {phase === 'done' && (
            <div className="space-y-4">
              {/* Score & metadata bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {qualityCheck && (
                    <Badge className={`font-semibold ${getScoreColor(qualityCheck.humanScore)}`}>
                      {qualityCheck.humanScore}/10 — {getScoreLabel(qualityCheck.humanScore)}
                    </Badge>
                  )}
                  {researchFailed && (
                    <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">
                      Sin investigacion
                    </Badge>
                  )}
                </div>
                {metadata && (
                  <span className="text-xs text-muted-foreground">
                    {(metadata.totalTimeMs / 1000).toFixed(1)}s
                    {metadata.sourcesUsed?.length > 0 && (
                      <span className="ml-1">· {metadata.sourcesUsed.length} fuente{metadata.sourcesUsed.length !== 1 ? 's' : ''}</span>
                    )}
                  </span>
                )}
              </div>

              {/* Issues */}
              {qualityCheck?.issues && qualityCheck.issues.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Posibles mejoras
                  </div>
                  {qualityCheck.issues.map((issue, i) => (
                    <p key={i} className="text-xs text-amber-600 pl-5">• {issue}</p>
                  ))}
                </div>
              )}

              {/* Subject (email only) */}
              {isEmail && generatedSubject && (
                <Card>
                  <CardContent className="py-3">
                    <p className="text-xs text-muted-foreground mb-1">Asunto</p>
                    <p className="text-sm font-medium">{generatedSubject}</p>
                  </CardContent>
                </Card>
              )}

              {/* Generated message */}
              <Card>
                <CardHeader className="py-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium">Mensaje generado</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-7 px-2 text-xs gap-1"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </Button>
                </CardHeader>
                <CardContent className="py-2">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{generatedMessage}</pre>
                </CardContent>
              </Card>

              {/* Detected signals */}
              {detectedSignals.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Zap className="h-3 w-3 text-amber-500" />
                    Señales detectadas ({detectedSignals.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {detectedSignals.map((s, i) => (
                      <Badge key={i} variant="secondary" className="text-xs gap-1">
                        ⚡ {s.signalName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Research summary */}
              {researchSummary && (
                <div>
                  <button
                    onClick={() => setShowResearch(!showResearch)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1.5"
                  >
                    {showResearch ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    Resumen de investigacion
                  </button>
                  {showResearch && (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{researchSummary}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Quick regenerate buttons */}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs flex-1"
                  onClick={() => doGenerate()}
                  disabled={isLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs flex-1"
                  onClick={() => doGenerate('shorter')}
                  disabled={isLoading}
                >
                  <ArrowDownRight className="h-3.5 w-3.5" />
                  Mas corto
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs flex-1"
                  onClick={() => doGenerate('different_angle')}
                  disabled={isLoading}
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  Otro angulo
                </Button>
              </div>
            </div>
          )}

          {/* ─── CHAT SECTION — appears after first generation ─── */}
          {(phase === 'done' || chatMessages.length > 0) && (
            <Card className="mt-2">
              <CardHeader className="py-3 border-b">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <WandSparkles className="h-4 w-4 text-purple-500" />
                  Iterar con AI
                  {activePrompt ? (
                    <Badge variant="secondary" className="text-[10px] font-normal ml-1">
                      Modifica: {activePrompt.name}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-normal ml-1 text-muted-foreground">
                      Sin prompt seleccionado — usara instrucciones adicionales
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>

              {/* Chat messages */}
              {chatMessages.length > 0 && (
                <div className="max-h-80 overflow-y-auto px-4 py-3 space-y-3">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'assistant' && (
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center mt-0.5">
                          <Bot className="h-3.5 w-3.5 text-purple-600" />
                        </div>
                      )}
                      <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div className={`rounded-xl px-3 py-2 text-sm leading-relaxed
                          ${msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : 'bg-muted rounded-bl-sm'
                          }`}
                        >
                          {msg.content}
                        </div>

                        {/* Change plan + proposed prompt */}
                        {msg.proposedPrompt && (
                          <div className="w-full space-y-2">
                            {/* Change summary from Agent 1 */}
                            {msg.changes && (
                              <div className="rounded-lg border border-muted bg-muted/40 p-3 space-y-2">
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                  Plan de cambios (Agente 1)
                                </p>
                                {msg.changes.reasoning && (
                                  <p className="text-xs text-muted-foreground italic">{msg.changes.reasoning}</p>
                                )}
                                {msg.changes.add.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-green-700 mb-0.5">+ Agregar</p>
                                    {msg.changes.add.map((item, i) => (
                                      <p key={i} className="text-xs text-green-800 pl-3">• {item}</p>
                                    ))}
                                  </div>
                                )}
                                {msg.changes.remove.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-red-700 mb-0.5">− Eliminar</p>
                                    {msg.changes.remove.map((item, i) => (
                                      <p key={i} className="text-xs text-red-800 pl-3">• {item}</p>
                                    ))}
                                  </div>
                                )}
                                {msg.changes.modify.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-amber-700 mb-0.5">~ Modificar</p>
                                    {msg.changes.modify.map((item, i) => (
                                      <p key={i} className="text-xs text-amber-800 pl-3">• {item}</p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Refined prompt from Agent 2 */}
                            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                              <p className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide mb-1.5">
                                Prompt refinado (Agente 2)
                              </p>
                              <p className="text-xs text-purple-900 whitespace-pre-wrap line-clamp-6">
                                {msg.proposedPrompt}
                              </p>
                            </div>
                            {msg.isApplied ? (
                              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1">
                                <Check className="h-3 w-3" />
                                Aplicado y guardado
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                className="gap-1.5 text-xs h-7 bg-purple-600 hover:bg-purple-700"
                                onClick={() => handleRequestApply(msg.proposedPrompt!, idx)}
                              >
                                <Save className="h-3 w-3" />
                                Guardar cambios en prompt
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Loading bubble */}
                  {applyingChat && (
                    <div className="flex gap-2 justify-start">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                        <Bot className="h-3.5 w-3.5 text-purple-600" />
                      </div>
                      <div className="bg-muted rounded-xl rounded-bl-sm px-3 py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Chat input */}
              <CardContent className="py-3 border-t">
                <div className="flex gap-2">
                  <Input
                    placeholder={activePrompt
                      ? `Ej: "Elimina los puntos y coma", "Se mas directo en el CTA"...`
                      : `Ej: "Hazlo mas corto", "Menciona su crecimiento"...`
                    }
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleChatSend()
                      }
                    }}
                    disabled={applyingChat || isLoading}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={handleChatSend}
                    disabled={!chatInput.trim() || applyingChat || isLoading}
                    className="flex-shrink-0 px-3"
                  >
                    {applyingChat
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <SendHorizonal className="h-4 w-4" />
                    }
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {activePrompt
                    ? 'El AI modificara el prompt seleccionado y pedira tu confirmacion antes de guardarlo'
                    : 'Sin prompt seleccionado — el feedback se usara como instruccion directa y regenerara el mensaje'
                  }
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ─── CONFIRMATION DIALOG ─── */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={open => !open && setConfirmDialog(d => ({ ...d, open: false }))}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirmar cambios en el prompt
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {/* Warning */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <strong>Atencion:</strong> Esto modificara permanentemente el prompt{' '}
              <strong>"{activePrompt?.name}"</strong> en tu cuenta.
              Todos los mensajes generados con este prompt en el futuro usaran la nueva version.
              Esta accion no se puede deshacer automaticamente.
            </div>

            {/* Old prompt */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Prompt actual
              </p>
              <div className="rounded-lg border bg-red-50 border-red-200 p-3 max-h-40 overflow-y-auto">
                <pre className="text-xs text-red-800 whitespace-pre-wrap">{activePrompt?.prompt_body}</pre>
              </div>
            </div>

            {/* New prompt */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Prompt propuesto (nuevo)
              </p>
              <div className="rounded-lg border bg-green-50 border-green-200 p-3 max-h-40 overflow-y-auto">
                <pre className="text-xs text-green-800 whitespace-pre-wrap">{confirmDialog.proposedPrompt}</pre>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t pt-4 gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDialog(d => ({ ...d, open: false }))}
              disabled={savingPrompt}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmApply}
              disabled={savingPrompt}
              className="gap-2 bg-purple-600 hover:bg-purple-700"
            >
              {savingPrompt ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {savingPrompt ? 'Guardando...' : 'Guardar y Regenerar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
