import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAgents } from '@/contexts/AgentContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Bot, Plus, MoreVertical, Trash2, Loader2, ChevronDown } from 'lucide-react'

const ROLE_TEMPLATES: Record<string, { skills: string[]; description: string }> = {
  sales: {
    skills: ['buscar_prospectos', 'crear_cadencia', 'enviar_mensaje', 'enviar_email', 'investigar_empresa', 'enriquecer_prospectos', 'gestionar_leads', 'business_case', 'ver_actividad', 'ver_metricas', 'ver_notificaciones', 'ver_cadencia_detalle', 'ver_conexiones', 'ver_programacion', 'ver_calendario', 'buscar_slots_disponibles', 'crear_evento_calendario'],
    description: 'Vendedor completo: prospecta, investiga, envia mensajes, gestiona cadencias',
  },
  cpo: {
    skills: ['investigar_empresa', 'gestionar_leads', 'ver_actividad', 'ver_metricas', 'business_case'],
    description: 'Producto: investiga mercado, analiza metricas, genera business cases',
  },
  developer: {
    skills: ['ver_actividad', 'ver_metricas'],
    description: 'Dev: acceso a metricas y actividad para debugging',
  },
  cfo: {
    skills: ['ver_metricas', 'ver_actividad', 'business_case'],
    description: 'Finanzas: metricas, actividad, business cases',
  },
  hr: {
    skills: ['buscar_prospectos', 'enviar_email', 'ver_calendario', 'buscar_slots_disponibles', 'crear_evento_calendario'],
    description: 'RRHH: buscar personas, enviar emails, gestionar calendario',
  },
  marketing: {
    skills: ['investigar_empresa', 'descubrir_empresas', 'business_case', 'ver_metricas'],
    description: 'Marketing: investigar empresas, descubrir mercado, generar contenido',
  },
  custom: { skills: [], description: 'Selecciona skills manualmente' },
}

const ROLE_OPTIONS = [
  { value: 'sales', label: 'Sales' },
  { value: 'cpo', label: 'CPO / Product' },
  { value: 'developer', label: 'Developer' },
  { value: 'cfo', label: 'CFO / Finance' },
  { value: 'hr', label: 'HR' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'custom', label: 'Custom' },
]

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  deploying: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  paused: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

export function Agents() {
  const navigate = useNavigate()
  const { agents, isLoading, createAgent, deleteAgent, skillRegistry } = useAgents()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [description, setDescription] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Auto-populate skills when role changes
  useEffect(() => {
    if (role && ROLE_TEMPLATES[role]) {
      setSelectedSkills(ROLE_TEMPLATES[role].skills)
    }
  }, [role])

  const toggleSkill = (skillName: string) => {
    setSelectedSkills(prev =>
      prev.includes(skillName) ? prev.filter(s => s !== skillName) : [...prev, skillName]
    )
  }

  const handleCreate = async () => {
    if (!name || !role) return
    setCreating(true)
    try {
      const agent = await createAgent(name, role, description, selectedSkills)
      if (agent) {
        setIsCreateOpen(false)
        setName('')
        setRole('')
        setDescription('')
        setSelectedSkills([])
      }
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleting(id)
    try { await deleteAgent(id) } finally { setDeleting(null) }
  }

  // Group skills by category for the selection UI
  const skillsByCategory = skillRegistry
    .filter(s => !s.is_system)
    .reduce((acc, s) => {
      if (!acc[s.category]) acc[s.category] = []
      acc[s.category].push(s)
      return acc
    }, {} as Record<string, typeof skillRegistry>)

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading">AI Agents</h1>
          <p className="text-muted-foreground mt-1">Create and manage AI agents with specific roles</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Create Agent</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Agent</DialogTitle>
              <DialogDescription>Create a new AI agent with a specific role and capabilities</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="agent-name">Name</Label>
                <Input id="agent-name" placeholder="e.g., CPO Agent" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-role">Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {role && ROLE_TEMPLATES[role] && (
                  <p className="text-xs text-muted-foreground">{ROLE_TEMPLATES[role].description}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-desc">Description</Label>
                <Textarea id="agent-desc" placeholder="What should this agent do?" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
              </div>

              {/* Skills Selection */}
              <div>
                <Button variant="outline" size="sm" className="w-full justify-between" type="button" onClick={() => setSkillsOpen(!skillsOpen)}>
                  Skills ({selectedSkills.length} selected)
                  <ChevronDown className={`h-4 w-4 transition-transform ${skillsOpen ? 'rotate-180' : ''}`} />
                </Button>
                {skillsOpen && (
                  <div className="mt-2 space-y-3 max-h-[250px] overflow-y-auto border rounded-md p-3">
                    {Object.entries(skillsByCategory).map(([category, skills]) => (
                      <div key={category}>
                        <p className="text-xs font-medium text-muted-foreground uppercase mb-1.5">{category}</p>
                        <div className="space-y-1">
                          {skills.map(skill => (
                            <label key={skill.name} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                              <Checkbox
                                checked={selectedSkills.includes(skill.name)}
                                onCheckedChange={() => toggleSkill(skill.name)}
                              />
                              <span className="flex-1">{skill.display_name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !name || !role}>
                {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : 'Create Agent'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No agents yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Create your first AI agent to get started</p>
            <Button onClick={() => setIsCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Create Agent</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map(agent => (
            <Card key={agent.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate(`/agents/${agent.id}`)}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1 min-w-0 flex-1">
                  <CardTitle className="text-base truncate">{agent.name}</CardTitle>
                  <CardDescription className="line-clamp-2">{agent.description || 'No description'}</CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"><MoreVertical className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="text-destructive" disabled={deleting === agent.id} onClick={e => handleDelete(agent.id, e)}>
                      <Trash2 className="mr-2 h-4 w-4" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{ROLE_OPTIONS.find(r => r.value === agent.role)?.label || agent.role}</Badge>
                  <Badge className={STATUS_COLORS[agent.status] || STATUS_COLORS.draft}>{agent.status}</Badge>
                  <span className="text-xs text-muted-foreground">{agent.agent_skills?.length || 0} skills</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Created {new Date(agent.created_at).toLocaleDateString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
