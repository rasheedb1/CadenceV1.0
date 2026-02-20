import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { useSenderPersona } from '@/hooks/useSenderPersona'
import {
  callEdgeFunction,
  type AIPolishPromptResponse,
  type AIPrompt,
} from '@/lib/edge-functions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { LLMModelSelector } from '@/components/LLMModelSelector'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
  Plus,
  Brain,
  Pencil,
  Trash2,
  Sparkles,
  Loader2,
  MessageSquare,
  UserPlus,
  MessageCircle,
  Mail,
  Star,
  Search,
  BookOpen,
  User,
  X,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'
import { PermissionGate } from '@/components/PermissionGate'
import { ExampleSectionsTab } from '@/components/ExampleSectionsTab'

const STEP_TYPES = [
  { value: 'linkedin_message', label: 'LinkedIn Message', icon: MessageSquare, color: 'bg-sky-100 text-sky-700' },
  { value: 'linkedin_connect', label: 'LinkedIn Connect', icon: UserPlus, color: 'bg-cyan-100 text-cyan-700' },
  { value: 'linkedin_comment', label: 'LinkedIn Comment', icon: MessageCircle, color: 'bg-emerald-100 text-emerald-700' },
  { value: 'send_email', label: 'Send Email', icon: Mail, color: 'bg-violet-100 text-violet-700' },
] as const

const TONES = [
  { value: 'professional', label: 'Profesional' },
  { value: 'casual', label: 'Casual' },
  { value: 'friendly', label: 'Amigable' },
] as const

const OBJECTIVES = [
  { value: 'first_touch', label: 'Primer contacto' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 're_engage', label: 'Re-engage' },
  { value: 'break_up', label: 'Break-up' },
  { value: 'referral', label: 'Referral' },
] as const

const COMMUNICATION_STYLES = [
  { value: 'founder_to_founder', label: 'Founder-to-Founder', desc: 'Directo, entre iguales' },
  { value: 'expert_consultant', label: 'Consultor Experto', desc: 'Autoridad accesible' },
  { value: 'peer_casual', label: 'Peer Casual', desc: 'Colega de industria' },
  { value: 'executive_brief', label: 'Executive Brief', desc: 'Conciso y ejecutivo' },
] as const

type PromptTabType = 'persona' | 'message' | 'research' | 'examples'
type StepType = 'linkedin_message' | 'linkedin_connect' | 'linkedin_comment' | 'send_email'
type Tone = 'professional' | 'casual' | 'friendly'

const TEMPLATE_VARIABLES = [
  { key: 'first_name', label: 'Nombre', example: 'Juan' },
  { key: 'last_name', label: 'Apellido', example: 'Perez' },
  { key: 'company', label: 'Empresa', example: 'Walmart' },
  { key: 'title', label: 'Cargo', example: 'VP Engineering' },
  { key: 'email', label: 'Email', example: 'juan@empresa.com' },
  { key: 'linkedin_url', label: 'LinkedIn', example: 'linkedin.com/in/...' },
  { key: 'industry', label: 'Industria', example: 'e-learning' },
  { key: 'website', label: 'Sitio Web', example: 'edpuzzle.com' },
  { key: 'department', label: 'Departamento', example: 'Sales' },
  { key: 'annual_revenue', label: 'Ingresos Anuales', example: '$10M' },
] as const

interface FormData {
  name: string
  prompt_type: 'message' | 'research'
  step_type: StepType | null
  description: string
  prompt_body: string
  tone: Tone
  language: string
  is_default: boolean
  objective: string | null
  structure: string
  writing_principles: string[]
  anti_patterns: string[]
}

const makeEmptyForm = (promptType: 'message' | 'research'): FormData => ({
  name: '',
  prompt_type: promptType,
  step_type: promptType === 'message' ? 'linkedin_message' : null,
  description: '',
  prompt_body: '',
  tone: 'professional',
  language: 'es',
  is_default: false,
  objective: null,
  structure: '',
  writing_principles: [],
  anti_patterns: [],
})

export function AIPrompts() {
  const { user, session } = useAuth()
  const { orgId } = useOrg()
  const queryClient = useQueryClient()
  const { persona, isLoading: personaLoading, save: savePersona, isSaving: personaSaving } = useSenderPersona()

  const [activeTab, setActiveTab] = useState<PromptTabType>('persona')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(makeEmptyForm('message'))
  const [polishing, setPolishing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0)
  const promptBodyRef = useRef<HTMLTextAreaElement>(null)
  const slashStartPos = useRef<number | null>(null)

  // Persona form state
  const [personaForm, setPersonaForm] = useState({
    full_name: '',
    role: '',
    company: '',
    value_proposition: '',
    credibility: '',
    communication_style: 'expert_consultant' as string,
    signature: '',
  })
  const [personaFormLoaded, setPersonaFormLoaded] = useState(false)

  // Load persona into form when data arrives
  if (persona && !personaFormLoaded) {
    setPersonaForm({
      full_name: persona.full_name || '',
      role: persona.role || '',
      company: persona.company || '',
      value_proposition: persona.value_proposition || '',
      credibility: persona.credibility || '',
      communication_style: persona.communication_style || 'expert_consultant',
      signature: persona.signature || '',
    })
    setPersonaFormLoaded(true)
  }

  // Tag input states
  const [principleInput, setPrincipleInput] = useState('')
  const [antiPatternInput, setAntiPatternInput] = useState('')

  // Fetch all prompts
  const { data: prompts = [], isLoading } = useQuery({
    queryKey: ['ai-prompts', orgId],
    queryFn: async () => {
      if (!user || !orgId) return []
      const { data, error } = await supabase
        .from('ai_prompts')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as AIPrompt[]
    },
    enabled: !!user && !!orgId,
  })

  const messagePrompts = prompts.filter(p => p.prompt_type === 'message')
  const researchPrompts = prompts.filter(p => p.prompt_type === 'research')

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!user) throw new Error('Not authenticated')

      if (form.is_default) {
        if (form.prompt_type === 'research') {
          await supabase
            .from('ai_prompts')
            .update({ is_default: false })
            .eq('org_id', orgId!)
            .eq('prompt_type', 'research')
        } else {
          await supabase
            .from('ai_prompts')
            .update({ is_default: false })
            .eq('org_id', orgId!)
            .eq('prompt_type', 'message')
            .eq('step_type', form.step_type!)
        }
      }

      const { data, error } = await supabase
        .from('ai_prompts')
        .insert({
          owner_id: user.id,
          org_id: orgId!,
          name: form.name,
          prompt_type: form.prompt_type,
          step_type: form.step_type,
          description: form.description || null,
          prompt_body: form.prompt_body,
          tone: form.tone,
          language: form.language,
          is_default: form.is_default,
          objective: form.objective || null,
          structure: form.structure || null,
          writing_principles: form.writing_principles,
          anti_patterns: form.anti_patterns,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-prompts'] })
      setIsCreateOpen(false)
      setFormData(makeEmptyForm(activeTab === 'message' ? 'message' : 'research'))
      toast.success('Prompt creado')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al crear'),
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: FormData }) => {
      if (!user) throw new Error('Not authenticated')

      if (form.is_default) {
        if (form.prompt_type === 'research') {
          await supabase
            .from('ai_prompts')
            .update({ is_default: false })
            .eq('org_id', orgId!)
            .eq('prompt_type', 'research')
            .neq('id', id)
        } else {
          await supabase
            .from('ai_prompts')
            .update({ is_default: false })
            .eq('org_id', orgId!)
            .eq('prompt_type', 'message')
            .eq('step_type', form.step_type!)
            .neq('id', id)
        }
      }

      const { error } = await supabase
        .from('ai_prompts')
        .update({
          name: form.name,
          prompt_type: form.prompt_type,
          step_type: form.step_type,
          description: form.description || null,
          prompt_body: form.prompt_body,
          tone: form.tone,
          language: form.language,
          is_default: form.is_default,
          objective: form.objective || null,
          structure: form.structure || null,
          writing_principles: form.writing_principles,
          anti_patterns: form.anti_patterns,
        })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-prompts'] })
      setIsEditOpen(false)
      setEditingId(null)
      toast.success('Prompt actualizado')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al actualizar'),
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_prompts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-prompts'] })
      setDeleteId(null)
      toast.success('Prompt eliminado')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al eliminar'),
  })

  // Polish prompt handler
  const handlePolish = async () => {
    if (!formData.description.trim()) {
      toast.error('Escribe una descripcion primero')
      return
    }
    if (!session?.access_token) {
      toast.error('No hay sesion activa')
      return
    }

    setPolishing(true)
    try {
      const result = await callEdgeFunction<AIPolishPromptResponse>(
        'ai-polish-prompt',
        {
          description: formData.description,
          promptType: formData.prompt_type,
          stepType: formData.step_type || undefined,
          tone: formData.tone,
          language: formData.language,
        },
        session.access_token
      )

      if (result.success && result.polishedPrompt) {
        setFormData(prev => ({ ...prev, prompt_body: result.polishedPrompt }))
        toast.success('Prompt pulido con AI')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al pulir prompt')
    } finally {
      setPolishing(false)
    }
  }

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.prompt_body.trim()) {
      toast.error('Nombre y prompt son requeridos')
      return
    }
    setSaving(true)
    try {
      await createMutation.mutateAsync(formData)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingId || !formData.name.trim() || !formData.prompt_body.trim()) {
      toast.error('Nombre y prompt son requeridos')
      return
    }
    setSaving(true)
    try {
      await updateMutation.mutateAsync({ id: editingId, form: formData })
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (prompt: AIPrompt) => {
    setFormData({
      name: prompt.name,
      prompt_type: prompt.prompt_type,
      step_type: prompt.step_type,
      description: prompt.description || '',
      prompt_body: prompt.prompt_body,
      tone: prompt.tone,
      language: prompt.language,
      is_default: prompt.is_default,
      objective: prompt.objective || null,
      structure: prompt.structure || '',
      writing_principles: prompt.writing_principles || [],
      anti_patterns: prompt.anti_patterns || [],
    })
    setEditingId(prompt.id)
    setIsEditOpen(true)
  }

  const openCreate = () => {
    setFormData(makeEmptyForm(activeTab === 'message' ? 'message' : 'research'))
    setIsCreateOpen(true)
  }

  // Save persona
  const handleSavePersona = async () => {
    if (!personaForm.full_name.trim() || !personaForm.role.trim() || !personaForm.company.trim()) {
      toast.error('Nombre, rol y empresa son requeridos')
      return
    }
    await savePersona({
      full_name: personaForm.full_name,
      role: personaForm.role,
      company: personaForm.company,
      value_proposition: personaForm.value_proposition,
      credibility: personaForm.credibility,
      communication_style: personaForm.communication_style as 'founder_to_founder' | 'expert_consultant' | 'peer_casual' | 'executive_brief',
      signature: personaForm.signature,
    })
  }

  // ─── Tag helpers ───
  const addPrinciple = () => {
    const val = principleInput.trim()
    if (val && !formData.writing_principles.includes(val)) {
      setFormData(prev => ({ ...prev, writing_principles: [...prev.writing_principles, val] }))
      setPrincipleInput('')
    }
  }

  const removePrinciple = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      writing_principles: prev.writing_principles.filter((_, i) => i !== idx),
    }))
  }

  const addAntiPattern = () => {
    const val = antiPatternInput.trim()
    if (val && !formData.anti_patterns.includes(val)) {
      setFormData(prev => ({ ...prev, anti_patterns: [...prev.anti_patterns, val] }))
      setAntiPatternInput('')
    }
  }

  const removeAntiPattern = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      anti_patterns: prev.anti_patterns.filter((_, i) => i !== idx),
    }))
  }

  // ─── Slash command helpers ───
  const getFilteredVariables = () => {
    if (!slashFilter) return TEMPLATE_VARIABLES
    const lower = slashFilter.toLowerCase()
    return TEMPLATE_VARIABLES.filter(v =>
      v.key.includes(lower) || v.label.toLowerCase().includes(lower)
    )
  }

  const handlePromptBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart
    setFormData(prev => ({ ...prev, prompt_body: value }))

    const charBefore = value[cursorPos - 1]
    const charTwoBefore = value[cursorPos - 2] ?? ''

    if (charBefore === '/' && (cursorPos === 1 || /[\s\n]/.test(charTwoBefore))) {
      slashStartPos.current = cursorPos - 1
      setSlashFilter('')
      setSelectedSlashIndex(0)
      setShowSlashMenu(true)
    } else if (showSlashMenu && slashStartPos.current !== null) {
      const afterSlash = value.substring(slashStartPos.current + 1, cursorPos)
      if (afterSlash.includes(' ') || afterSlash.includes('\n') || cursorPos <= slashStartPos.current) {
        setShowSlashMenu(false)
        slashStartPos.current = null
      } else {
        setSlashFilter(afterSlash)
        setSelectedSlashIndex(0)
      }
    }
  }

  const handlePromptBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSlashMenu) return
    const filtered = getFilteredVariables()

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedSlashIndex(prev => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedSlashIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      if (filtered[selectedSlashIndex]) {
        insertVariable(filtered[selectedSlashIndex].key)
      }
    } else if (e.key === 'Escape') {
      setShowSlashMenu(false)
      slashStartPos.current = null
    }
  }

  const insertVariable = (varKey: string) => {
    const textarea = promptBodyRef.current
    if (!textarea || slashStartPos.current === null) return

    const value = formData.prompt_body
    const start = slashStartPos.current
    const end = textarea.selectionStart
    const insertion = `{{${varKey}}}`
    const newValue = value.substring(0, start) + insertion + value.substring(end)

    setFormData(prev => ({ ...prev, prompt_body: newValue }))
    setShowSlashMenu(false)
    slashStartPos.current = null

    setTimeout(() => {
      textarea.focus()
      const pos = start + insertion.length
      textarea.setSelectionRange(pos, pos)
    }, 0)
  }

  const insertVariableAtCursor = (varKey: string) => {
    const textarea = promptBodyRef.current
    if (!textarea) return

    const value = formData.prompt_body
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const insertion = `{{${varKey}}}`
    const newValue = value.substring(0, start) + insertion + value.substring(end)

    setFormData(prev => ({ ...prev, prompt_body: newValue }))

    setTimeout(() => {
      textarea.focus()
      const pos = start + insertion.length
      textarea.setSelectionRange(pos, pos)
    }, 0)
  }

  const renderWithVariables = (text: string) => {
    const parts = text.split(/(\{\{[^}]+\}\})/g)
    return parts.map((part, i) => {
      const match = part.match(/^\{\{(\w+)\}\}$/)
      if (match) {
        const varKey = match[1]
        const varConfig = TEMPLATE_VARIABLES.find(v => v.key === varKey)
        return (
          <span
            key={i}
            className="inline-flex items-center bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 py-0.5 rounded text-[10px] font-semibold mx-0.5"
          >
            {varConfig?.label || varKey}
          </span>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  const getStepTypeConfig = (type: string | null) =>
    STEP_TYPES.find(s => s.value === type) || STEP_TYPES[0]

  // Group message prompts by step_type
  const grouped = STEP_TYPES.map(st => ({
    ...st,
    prompts: messagePrompts.filter(p => p.step_type === st.value),
  }))

  const isResearchForm = formData.prompt_type === 'research'

  // ─── Prompt Form (reused in create/edit) ───
  const renderForm = () => (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <Label>Nombre</Label>
        <Input
          placeholder={isResearchForm
            ? 'Ej: Research enfocado en funding y tecnologia'
            : 'Ej: Outreach para SaaS founders'
          }
          value={formData.name}
          onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
        />
      </div>

      {/* Step type (only for message prompts) */}
      {!isResearchForm && (
        <div>
          <Label>Tipo de step</Label>
          <Select
            value={formData.step_type || 'linkedin_message'}
            onValueChange={(v) => setFormData(prev => ({ ...prev, step_type: v as StepType }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STEP_TYPES.map(st => (
                <SelectItem key={st.value} value={st.value}>
                  {st.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Objective (only for message prompts) */}
      {!isResearchForm && (
        <div>
          <Label>Objetivo del mensaje</Label>
          <Select
            value={formData.objective || 'none'}
            onValueChange={(v) => setFormData(prev => ({ ...prev, objective: v === 'none' ? null : v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un objetivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin objetivo especifico</SelectItem>
              {OBJECTIVES.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Tone + Language row */}
      <div className="grid grid-cols-2 gap-3">
        {!isResearchForm && (
          <div>
            <Label>Tono</Label>
            <Select
              value={formData.tone}
              onValueChange={(v) => setFormData(prev => ({ ...prev, tone: v as Tone }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className={isResearchForm ? 'col-span-2' : ''}>
          <Label>Idioma</Label>
          <Select
            value={formData.language}
            onValueChange={(v) => setFormData(prev => ({ ...prev, language: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="es">Espanol</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="pt">Portugues</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Description + Polish button */}
      <div>
        <Label>
          {isResearchForm
            ? 'Descripcion (que tipo de investigacion quieres)'
            : 'Descripcion (lo que quieres lograr)'
          }
        </Label>
        <Textarea
          placeholder={isResearchForm
            ? 'Ej: Quiero que la investigacion se enfoque en funding reciente, stack tecnologico, y los intereses del prospecto segun sus posts...'
            : 'Ej: Quiero un mensaje que mencione algo reciente del prospecto, proponga una demo de 15 min, y suene casual pero profesional...'
          }
          value={formData.description}
          onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
          rows={3}
          className="text-sm"
        />
        <div className="flex items-center gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePolish}
            disabled={polishing || !formData.description.trim()}
          >
            {polishing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4 text-purple-500" />
            )}
            {polishing ? 'Puliendo...' : 'Polish Prompt con AI'}
          </Button>
          <LLMModelSelector />
        </div>
      </div>

      {/* Prompt body */}
      <div>
        <Label>
          {isResearchForm
            ? 'Prompt (instrucciones para el analista de investigacion)'
            : 'Prompt (instrucciones para el generador de mensajes)'
          }
        </Label>

        {/* Variable chips */}
        <div className="flex flex-wrap items-center gap-1.5 my-2">
          <span className="text-xs text-muted-foreground">Variables:</span>
          {TEMPLATE_VARIABLES.map(v => (
            <button
              key={v.key}
              type="button"
              className="inline-flex items-center gap-1 bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:hover:bg-purple-900/40 dark:text-purple-300 px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer border border-purple-200 dark:border-purple-800"
              onClick={() => insertVariableAtCursor(v.key)}
              title={`Insertar {{${v.key}}} — Ej: ${v.example}`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Textarea with slash command */}
        <div className="relative">
          <Textarea
            ref={promptBodyRef}
            placeholder='Escribe instrucciones o usa / para insertar variables del lead...'
            value={formData.prompt_body}
            onChange={handlePromptBodyChange}
            onKeyDown={handlePromptBodyKeyDown}
            onBlur={() => setTimeout(() => { setShowSlashMenu(false); slashStartPos.current = null }, 200)}
            rows={8}
            className="text-sm font-mono"
          />

          {/* Slash command menu */}
          {showSlashMenu && (
            <div className="absolute z-50 bottom-full mb-1 left-0 w-72 bg-popover border rounded-lg shadow-lg p-1 max-h-52 overflow-y-auto">
              <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                Variables del lead
              </div>
              {getFilteredVariables().map((v, i) => (
                <button
                  key={v.key}
                  type="button"
                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors ${
                    selectedSlashIndex === i
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    insertVariable(v.key)
                  }}
                >
                  <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 py-0.5 rounded text-xs font-mono">
                    {`{{${v.key}}}`}
                  </span>
                  <span className="text-muted-foreground text-xs">{v.label}</span>
                  <span className="text-muted-foreground/50 text-[10px] ml-auto">{v.example}</span>
                </button>
              ))}
              {getFilteredVariables().length === 0 && (
                <p className="text-xs text-muted-foreground p-2">No hay variables que coincidan</p>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-1">
          Escribe "/" para ver variables disponibles. Las variables como {'{{first_name}}'} se reemplazan con datos reales de cada lead.
        </p>
      </div>

      {/* Structure (only for message prompts) */}
      {!isResearchForm && (
        <div>
          <Label>Estructura del mensaje (opcional)</Label>
          <Textarea
            placeholder="Ej: 1. Hook con referencia personal\n2. Conexion con su problema\n3. Propuesta de valor breve\n4. CTA suave"
            value={formData.structure}
            onChange={e => setFormData(prev => ({ ...prev, structure: e.target.value }))}
            rows={4}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Define como quieres que se organice el mensaje.
          </p>
        </div>
      )}

      {/* Writing Principles (only for message prompts) */}
      {!isResearchForm && (
        <div>
          <Label>Principios de escritura</Label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {formData.writing_principles.map((p, i) => (
              <Badge key={i} variant="secondary" className="gap-1 pr-1">
                {p}
                <button type="button" onClick={() => removePrinciple(i)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Ej: Usar datos especificos, no generalidades"
              value={principleInput}
              onChange={e => setPrincipleInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPrinciple() } }}
              className="text-sm"
            />
            <Button variant="outline" size="sm" onClick={addPrinciple} disabled={!principleInput.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Anti-Patterns (only for message prompts) */}
      {!isResearchForm && (
        <div>
          <Label>Anti-patterns (cosas que NO debe hacer)</Label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {formData.anti_patterns.map((p, i) => (
              <Badge key={i} variant="outline" className="gap-1 pr-1 border-red-200 text-red-700 dark:border-red-800 dark:text-red-400">
                {p}
                <button type="button" onClick={() => removeAntiPattern(i)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder='Ej: No usar "espero que estes bien"'
              value={antiPatternInput}
              onChange={e => setAntiPatternInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAntiPattern() } }}
              className="text-sm"
            />
            <Button variant="outline" size="sm" onClick={addAntiPattern} disabled={!antiPatternInput.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Default toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.is_default}
          onChange={e => setFormData(prev => ({ ...prev, is_default: e.target.checked }))}
          className="rounded border-gray-300"
        />
        <span className="text-sm">
          {isResearchForm
            ? 'Usar como default para investigacion'
            : `Usar como default para ${getStepTypeConfig(formData.step_type).label}`
          }
        </span>
      </label>
    </div>
  )

  const renderPromptCard = (prompt: AIPrompt) => (
    <Card key={prompt.id} className="relative">
      {prompt.is_default && (
        <div className="absolute top-3 right-3">
          <Badge className="bg-amber-100 text-amber-700 border-amber-200">
            <Star className="h-3 w-3 mr-1 fill-current" />
            Default
          </Badge>
        </div>
      )}
      <CardHeader className="pb-2">
        <CardTitle className="text-base pr-20">{prompt.name}</CardTitle>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {prompt.step_type && (
            <Badge variant="outline" className="text-xs">
              {getStepTypeConfig(prompt.step_type).label}
            </Badge>
          )}
          {prompt.objective && (
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
              {OBJECTIVES.find(o => o.value === prompt.objective)?.label || prompt.objective}
            </Badge>
          )}
          {prompt.prompt_type === 'message' && (
            <Badge variant="outline" className="text-xs">
              {TONES.find(t => t.value === prompt.tone)?.label || prompt.tone}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {prompt.language.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {prompt.description && (
          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
            {prompt.description}
          </p>
        )}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 line-clamp-3 leading-relaxed">
          {renderWithVariables(prompt.prompt_body)}
        </div>

        {/* Show writing principles and anti-patterns */}
        {(prompt.writing_principles?.length > 0 || prompt.anti_patterns?.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {prompt.writing_principles?.map((p, i) => (
              <Badge key={`wp-${i}`} variant="secondary" className="text-[10px]">{p}</Badge>
            ))}
            {prompt.anti_patterns?.map((p, i) => (
              <Badge key={`ap-${i}`} variant="outline" className="text-[10px] border-red-200 text-red-600">{p}</Badge>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={() => openEdit(prompt)}>
            <Pencil className="mr-1 h-3 w-3" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteId(prompt.id)}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Eliminar
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-500" />
            AI Prompts
          </h1>
          <p className="text-muted-foreground mt-1">
            Configura tu perfil, prompts y referencias para controlar como el AI genera mensajes.
          </p>
        </div>
        {(activeTab === 'message' || activeTab === 'research') && (
          <PermissionGate permission="ai_prompts_create">
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Crear Prompt
            </Button>
          </PermissionGate>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PromptTabType)}>
        <TabsList>
          <TabsTrigger value="persona" className="gap-1.5">
            <User className="h-4 w-4" />
            Mi Perfil
          </TabsTrigger>
          <TabsTrigger value="message" className="gap-1.5">
            <MessageSquare className="h-4 w-4" />
            Prompts de Mensaje
            {messagePrompts.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1 h-5">{messagePrompts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="research" className="gap-1.5">
            <Search className="h-4 w-4" />
            Investigacion
            {researchPrompts.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1 h-5">{researchPrompts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="examples" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            Referencias
          </TabsTrigger>
        </TabsList>

        {/* Mi Perfil Tab */}
        <TabsContent value="persona" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="h-5 w-5 text-purple-500" />
                Perfil del Remitente
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Esta informacion se incluye automaticamente en cada mensaje que generas. Permite que el AI escriba como si fueras tu.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {personaLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Nombre completo *</Label>
                      <Input
                        placeholder="Ej: Carlos Martinez"
                        value={personaForm.full_name}
                        onChange={e => setPersonaForm(prev => ({ ...prev, full_name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Rol / Cargo *</Label>
                      <Input
                        placeholder="Ej: CEO & Co-Founder"
                        value={personaForm.role}
                        onChange={e => setPersonaForm(prev => ({ ...prev, role: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Empresa *</Label>
                    <Input
                      placeholder="Ej: Closr"
                      value={personaForm.company}
                      onChange={e => setPersonaForm(prev => ({ ...prev, company: e.target.value }))}
                    />
                  </div>

                  <div>
                    <Label>Propuesta de valor</Label>
                    <Textarea
                      placeholder="Ej: Ayudamos a equipos de ventas B2B a automatizar su prospección en LinkedIn con AI personalizado"
                      value={personaForm.value_proposition}
                      onChange={e => setPersonaForm(prev => ({ ...prev, value_proposition: e.target.value }))}
                      rows={2}
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Que ofreces y por que deberian escucharte.
                    </p>
                  </div>

                  <div>
                    <Label>Credibilidad (opcional)</Label>
                    <Textarea
                      placeholder="Ej: +200 empresas usando la plataforma, ex-VP en Salesforce, speaker en SaaStr"
                      value={personaForm.credibility}
                      onChange={e => setPersonaForm(prev => ({ ...prev, credibility: e.target.value }))}
                      rows={2}
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Logros, numeros, o referencias que respaldan tu autoridad.
                    </p>
                  </div>

                  <div>
                    <Label>Estilo de comunicacion</Label>
                    <Select
                      value={personaForm.communication_style}
                      onValueChange={(v) => setPersonaForm(prev => ({ ...prev, communication_style: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMUNICATION_STYLES.map(s => (
                          <SelectItem key={s.value} value={s.value}>
                            <span className="flex items-center gap-2">
                              {s.label}
                              <span className="text-muted-foreground text-xs">— {s.desc}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Firma (opcional)</Label>
                    <Input
                      placeholder="Ej: — Carlos, Closr"
                      value={personaForm.signature}
                      onChange={e => setPersonaForm(prev => ({ ...prev, signature: e.target.value }))}
                    />
                  </div>

                  <Button onClick={handleSavePersona} disabled={personaSaving}>
                    {personaSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Guardar perfil
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Message Prompts Tab */}
        <TabsContent value="message" className="space-y-6 mt-4">
          {messagePrompts.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No tienes prompts de mensaje</h3>
                <p className="text-muted-foreground text-center mb-4 max-w-md">
                  Crea prompts para controlar como el AI genera mensajes, notas de conexion y comentarios.
                </p>
                <PermissionGate permission="ai_prompts_create">
                  <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Crear prompt de mensaje
                  </Button>
                </PermissionGate>
              </CardContent>
            </Card>
          )}

          {grouped
            .filter(g => g.prompts.length > 0)
            .map(group => {
              const StepIcon = group.icon
              return (
                <div key={group.value}>
                  <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
                    <StepIcon className="h-5 w-5" />
                    {group.label}
                    <Badge variant="secondary" className="text-xs">{group.prompts.length}</Badge>
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {group.prompts.map(renderPromptCard)}
                  </div>
                </div>
              )
            })}
        </TabsContent>

        {/* Research Prompts Tab */}
        <TabsContent value="research" className="space-y-6 mt-4">
          {researchPrompts.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Search className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No tienes prompts de investigacion</h3>
                <p className="text-muted-foreground text-center mb-4 max-w-md">
                  Crea prompts para controlar como el AI analiza y sintetiza la investigacion sobre tus prospectos.
                  Define que aspectos priorizar: funding, tecnologia, intereses, noticias, etc.
                </p>
                <PermissionGate permission="ai_prompts_create">
                  <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Crear prompt de investigacion
                  </Button>
                </PermissionGate>
              </CardContent>
            </Card>
          )}

          {researchPrompts.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {researchPrompts.map(renderPromptCard)}
            </div>
          )}
        </TabsContent>

        {/* Referencias Tab (renamed from Mensajes Base) */}
        <TabsContent value="examples" className="mt-4">
          <ExampleSectionsTab />
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isResearchForm ? (
                <Search className="h-5 w-5 text-blue-500" />
              ) : (
                <Brain className="h-5 w-5 text-purple-500" />
              )}
              {isResearchForm ? 'Crear Prompt de Investigacion' : 'Crear Prompt de Mensaje'}
            </DialogTitle>
          </DialogHeader>
          {renderForm()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear Prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Editar AI Prompt
            </DialogTitle>
          </DialogHeader>
          {renderForm()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion no se puede deshacer. El prompt sera eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
