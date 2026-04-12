/**
 * AgentSkillsPanel — visual capability/integration management + personality editor.
 * Toggle capabilities, see integration status, edit soul_md, apply templates.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Save, Loader2, CheckCircle2, XCircle, Mail, Calendar, HardDrive, Table2,
  Users, Linkedin, Search, Cloud, Globe, Code, Palette, FlaskConical, Megaphone,
  PenTool, BarChart3, Sparkles, RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://twilio-bridge-production-241b.up.railway.app'

// ── Capability definitions ──────────────────────────────────────────────
interface CapDef {
  key: string
  label: string
  desc: string
  icon: React.ReactNode
  group: 'google' | 'external' | 'builtin'
  auth?: 'google' | 'salesforce' | 'linkedin' | 'apikey'
}

const CAPABILITIES: CapDef[] = [
  // Google (one OAuth covers all)
  { key: 'inbox', label: 'Gmail', desc: 'Leer, buscar, archivar correos, crear drafts', icon: <Mail className="h-4 w-4" />, group: 'google', auth: 'google' },
  { key: 'calendar', label: 'Calendar', desc: 'Eventos, slots libres, crear eventos', icon: <Calendar className="h-4 w-4" />, group: 'google', auth: 'google' },
  { key: 'drive', label: 'Drive', desc: 'Buscar, leer, crear documentos', icon: <HardDrive className="h-4 w-4" />, group: 'google', auth: 'google' },
  { key: 'sheets', label: 'Sheets', desc: 'Leer, escribir, crear spreadsheets', icon: <Table2 className="h-4 w-4" />, group: 'google', auth: 'google' },
  { key: 'contacts', label: 'Contacts', desc: 'Buscar y listar contactos', icon: <Users className="h-4 w-4" />, group: 'google', auth: 'google' },
  { key: 'presentations', label: 'Slides', desc: 'Crear presentaciones de Google Slides', icon: <BarChart3 className="h-4 w-4" />, group: 'google', auth: 'google' },
  // External OAuth
  { key: 'linkedin', label: 'LinkedIn', desc: 'Perfiles, conexiones, mensajes', icon: <Linkedin className="h-4 w-4" />, group: 'external', auth: 'linkedin' },
  { key: 'salesforce', label: 'Salesforce', desc: 'Cuentas, leads, sync CRM', icon: <Cloud className="h-4 w-4" />, group: 'external', auth: 'salesforce' },
  { key: 'apollo', label: 'Apollo.io', desc: 'Búsqueda y enriquecimiento de prospectos', icon: <Search className="h-4 w-4" />, group: 'external', auth: 'apikey' },
  { key: 'business_cases', label: 'Business Cases', desc: 'Generar presentaciones PPTX de Yuno', icon: <BarChart3 className="h-4 w-4" />, group: 'external', auth: 'apikey' },
  // Built-in
  { key: 'code', label: 'Code', desc: 'Programar, editar archivos, deploys', icon: <Code className="h-4 w-4" />, group: 'builtin' },
  { key: 'design', label: 'Design', desc: 'UX/UI, specs, prototipos', icon: <Palette className="h-4 w-4" />, group: 'builtin' },
  { key: 'research', label: 'Research', desc: 'Investigación web, análisis', icon: <FlaskConical className="h-4 w-4" />, group: 'builtin' },
  { key: 'writing', label: 'Writing', desc: 'Redacción, reportes, documentos', icon: <PenTool className="h-4 w-4" />, group: 'builtin' },
  { key: 'outreach', label: 'Outreach', desc: 'Ventas, prospección, seguimiento', icon: <Megaphone className="h-4 w-4" />, group: 'builtin' },
  { key: 'ops', label: 'Ops', desc: 'Sistema, npm, git, deploy', icon: <BarChart3 className="h-4 w-4" />, group: 'builtin' },
  { key: 'data', label: 'Data', desc: 'Análisis de datos, SQL, reportes', icon: <Table2 className="h-4 w-4" />, group: 'builtin' },
  { key: 'browser', label: 'Browser', desc: 'Navegar, screenshots, formularios', icon: <Globe className="h-4 w-4" />, group: 'builtin' },
]

// ── Templates ───────────────────────────────────────────────────────────
interface Template {
  key: string
  label: string
  caps: string[]
  model: string
  personality: string
}

const TEMPLATES: Template[] = [
  { key: 'developer', label: 'Desarrollador', caps: ['code', 'ops', 'data'], model: 'claude-sonnet-4-6', personality: 'Técnico y directo. Piensa antes de actuar. Prioriza soluciones simples. Hace code review riguroso.' },
  { key: 'ux', label: 'Diseñador UX', caps: ['design', 'research', 'writing'], model: 'claude-sonnet-4-6', personality: 'Creativo y detallista. Busca referencias reales antes de diseñar. Prioriza usabilidad sobre estética.' },
  { key: 'qa', label: 'QA / Tester', caps: ['research', 'browser'], model: 'claude-haiku-4-5-20251001', personality: 'Escéptico y meticuloso. No aprueba fácil. Busca edge cases y bugs que otros no ven.' },
  { key: 'sales', label: 'Ventas / BDR', caps: ['outreach', 'research', 'writing', 'browser', 'linkedin', 'apollo', 'salesforce'], model: 'claude-sonnet-4-6', personality: 'Persuasivo y persistente. Orientado a métricas. Personaliza cada mensaje según el prospecto.' },
  { key: 'assistant', label: 'Asistente Personal', caps: ['inbox', 'calendar', 'drive', 'contacts', 'research', 'writing'], model: 'claude-haiku-4-5-20251001', personality: 'Eficiente y proactiva. Prioriza lo urgente. Resúmenes concisos. Nunca envía sin aprobación.' },
  { key: 'marketing', label: 'Marketing', caps: ['writing', 'research', 'browser', 'linkedin'], model: 'claude-sonnet-4-6', personality: 'Creativo y data-driven. Conoce tendencias. Adapta el tono al canal y audiencia.' },
  { key: 'researcher', label: 'Investigador', caps: ['research', 'writing', 'browser', 'apollo'], model: 'claude-sonnet-4-6', personality: 'Analítico y exhaustivo. Cita fuentes. Separa hechos de opiniones. Entrega reportes estructurados.' },
  { key: 'pm', label: 'Project Manager', caps: ['research', 'writing', 'calendar', 'sheets'], model: 'claude-haiku-4-5-20251001', personality: 'Organizado y conciso. Orientado a deadlines. Hace seguimiento proactivo. Escala blockers rápido.' },
]

interface Props {
  agent: {
    id: string
    org_id: string
    capabilities: string[]
    soul_md: string
    model: string
  }
  onUpdate: (updates: Record<string, unknown>) => Promise<void>
}

export function AgentSkillsPanel({ agent, onUpdate }: Props) {
  const [caps, setCaps] = useState<Set<string>>(new Set(agent.capabilities || []))
  const [soulMd, setSoulMd] = useState(agent.soul_md || '')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [integrationStatus, setIntegrationStatus] = useState<Record<string, { connected?: boolean; available?: boolean }>>({})
  const [loadingStatus, setLoadingStatus] = useState(true)

  // Sync from parent
  useEffect(() => {
    setCaps(new Set(agent.capabilities || []))
    setSoulMd(agent.soul_md || '')
    setDirty(false)
  }, [agent.id, agent.capabilities, agent.soul_md])

  // Fetch integration status
  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/integrations/status?org_id=${agent.org_id}`)
      const data = await res.json()
      setIntegrationStatus(data)
    } catch {} finally { setLoadingStatus(false) }
  }, [agent.org_id])

  useEffect(() => { fetchIntegrations() }, [fetchIntegrations])

  const toggleCap = (key: string) => {
    const next = new Set(caps)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setCaps(next)
    setDirty(true)
  }

  const applyTemplate = (tpl: Template) => {
    setCaps(new Set(tpl.caps))
    setSoulMd(prev => {
      // Preserve existing content but add/replace personality section
      const marker = '## Personalidad'
      const existing = prev.includes(marker) ? prev.substring(0, prev.indexOf(marker)) : prev
      return `${existing.trim()}\n\n## Personalidad\n${tpl.personality}`
    })
    setDirty(true)
    toast.success(`Template "${tpl.label}" aplicado`)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Direct Supabase PATCH (bypasses manage-agent edge function for reliability)
      const { error } = await supabase
        .from('agents')
        .update({ capabilities: [...caps], soul_md: soulMd, updated_at: new Date().toISOString() })
        .eq('id', agent.id)
      if (error) throw error
      // Also notify parent for context cache invalidation
      await onUpdate({ capabilities: [...caps], soul_md: soulMd }).catch(() => {})
      setDirty(false)
      toast.success('Skills y personalidad guardados')
    } catch (e: any) { toast.error(`Error: ${e.message || 'al guardar'}`) }
    finally { setSaving(false) }
  }

  const getAuthStatus = (cap: CapDef): 'connected' | 'available' | 'none' | 'loading' => {
    if (loadingStatus) return 'loading'
    if (cap.auth === 'google') return integrationStatus.google?.connected ? 'connected' : 'none'
    if (cap.auth === 'salesforce') return integrationStatus.salesforce?.connected ? 'connected' : 'none'
    if (cap.auth === 'linkedin') return integrationStatus.linkedin?.connected ? 'connected' : 'none'
    if (cap.auth === 'apikey') return integrationStatus[cap.key]?.available ? 'available' : 'none'
    return 'available' // built-in always available
  }

  const renderGroup = (group: 'google' | 'external' | 'builtin', title: string, desc: string) => {
    const items = CAPABILITIES.filter(c => c.group === group)
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          <CardDescription className="text-xs">{desc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {items.map(cap => {
            const enabled = caps.has(cap.key)
            const status = getAuthStatus(cap)
            return (
              <div key={cap.key} className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-muted/50">
                <Switch checked={enabled} onCheckedChange={() => toggleCap(cap.key)} disabled={saving} />
                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">{cap.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{cap.label}</span>
                    {status === 'connected' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                    {status === 'available' && <Badge variant="secondary" className="text-[10px] h-4 px-1">API</Badge>}
                    {status === 'none' && cap.auth && <XCircle className="h-3 w-3 text-muted-foreground" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{cap.desc}</p>
                </div>
              </div>
            )
          })}
          {group === 'google' && !integrationStatus.google?.connected && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2 px-2">
              Requiere Google conectado. Usa "Conecta mi Gmail" en Chief o la tab Integraciones.
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Template selector + Save */}
      <div className="flex items-center gap-3">
        <Select onValueChange={(v) => { const tpl = TEMPLATES.find(t => t.key === v); if (tpl) applyTemplate(tpl) }}>
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue placeholder="Aplicar template..." />
          </SelectTrigger>
          <SelectContent>
            {TEMPLATES.map(t => (
              <SelectItem key={t.key} value={t.key} className="text-xs">
                <Sparkles className="h-3 w-3 inline mr-1.5" />{t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={fetchIntegrations} disabled={loadingStatus}>
          <RefreshCw className={`h-3.5 w-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
        </Button>
        {dirty && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Guardar
          </Button>
        )}
      </div>

      {/* Capability groups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          {renderGroup('google', 'Google Workspace', 'Un solo login cubre todos los servicios de Google')}
          {renderGroup('external', 'Servicios Externos', 'LinkedIn, Salesforce, Apollo.io')}
        </div>
        <div className="space-y-4">
          {renderGroup('builtin', 'Capabilities Base', 'Habilidades integradas del agente')}

          {/* Personality editor */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Personalidad</CardTitle>
              <CardDescription className="text-xs">Define cómo se comporta, habla y decide el agente</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={soulMd}
                onChange={(e) => { setSoulMd(e.target.value); setDirty(true) }}
                rows={10}
                className="font-mono text-xs"
                placeholder="## Personalidad&#10;Describe el tono, estilo y reglas del agente..."
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
