import { useState } from 'react'
import { PageTransition } from "@/components/PageTransition"
import { Link } from 'react-router-dom'
import { useAccountMapping, type SuggestedPersona } from '@/contexts/AccountMappingContext'
import { useICPProfiles } from '@/hooks/useICPProfiles'
import { useAuth } from '@/contexts/AuthContext'
import { AddPersonaDialog } from '@/components/account-mapping/AddPersonaDialog'
import { LLMModelSelector } from '@/components/LLMModelSelector'
import { FeatureGate } from '@/components/FeatureGate'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  Trash2,
  Sparkles,
  Loader2,
  Pencil,
  Users,
  Building2,
  ChevronDown,
  ChevronRight,
  UserCircle,
} from 'lucide-react'
import {
  BUYING_ROLE_CONFIG,
  type BuyerPersona,
  type BuyingCommitteeRole,
  type PersonaGroup,
} from '@/types/account-mapping'
import { toast } from 'sonner'

// ── New / Edit group dialog ──────────────────────────────────────────────────

interface GroupDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial?: PersonaGroup | null
  onSave: (data: { name: string; description: string | null; scope: 'personal' | 'organization' }) => Promise<void>
}

function GroupDialog({ open, onOpenChange, initial, onSave }: GroupDialogProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [scope, setScope] = useState<'personal' | 'organization'>(initial?.scope ?? 'personal')
  const [saving, setSaving] = useState(false)

  // Reset when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setName(initial?.name ?? '')
      setDescription(initial?.description ?? '')
      setScope(initial?.scope ?? 'personal')
    }
    onOpenChange(v)
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), description: description.trim() || null, scope })
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar Grupo' : 'Nuevo Grupo de Persona'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. SaaS Finance Buyers"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              placeholder="Briefly describe what this group targets..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Scope</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setScope('personal')}
                className={`flex-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  scope === 'personal'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:border-muted-foreground'
                }`}
              >
                <UserCircle className="h-4 w-4" />
                <div className="text-left">
                  <p className="font-medium">Personal</p>
                  <p className="text-xs opacity-70">Only visible to you</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setScope('organization')}
                className={`flex-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  scope === 'organization'
                    ? 'border-purple-500 bg-purple-500/5 text-purple-600 dark:text-purple-400'
                    : 'border-border text-muted-foreground hover:border-muted-foreground'
                }`}
              >
                <Building2 className="h-4 w-4" />
                <div className="text-left">
                  <p className="font-medium">Organization</p>
                  <p className="text-xs opacity-70">Shared with all members</p>
                </div>
              </button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {initial ? 'Guardar' : 'Crear Grupo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── ICP Picker Dialog ────────────────────────────────────────────────────────

interface ICPPickerDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSelect: (icpProfileId: string | null) => void
}

function ICPPickerDialog({ open, onOpenChange, onSelect }: ICPPickerDialogProps) {
  const { data: icpProfiles = [], isLoading } = useICPProfiles()
  const [selected, setSelected] = useState<string | null>(null)

  const handleOpenChange = (v: boolean) => {
    if (v) setSelected(null)
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select an ICP Profile</DialogTitle>
          <DialogDescription>
            Choose an ICP profile so the AI can suggest personas tailored to your target companies.
            Or skip to suggest based on this group's description only.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-1.5 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : icpProfiles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Sin perfiles ICP.{' '}
              <Link to="/account-mapping" className="text-primary underline" onClick={() => onOpenChange(false)}>
                Create one first.
              </Link>
            </p>
          ) : (
            icpProfiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => setSelected(profile.id)}
                className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  selected === profile.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground'
                }`}
              >
                <p className="font-medium">{profile.name}</p>
                {profile.description && (
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{profile.description}</p>
                )}
              </button>
            ))
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant="ghost"
            size="sm"
            className="sm:mr-auto text-muted-foreground"
            onClick={() => { onOpenChange(false); onSelect(null) }}
          >
            Skip — use group context
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => { onOpenChange(false); onSelect(selected) }} disabled={!selected}>
            Suggest with ICP
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Persona group card ───────────────────────────────────────────────────────

interface GroupCardProps {
  group: PersonaGroup
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

function GroupCard({ group, expanded, onToggle, onEdit, onDelete }: GroupCardProps) {
  const { addPersona, updatePersona, deletePersona, suggestBuyerPersonas } = useAccountMapping()
  const { user } = useAuth()

  const [showAddPersona, setShowAddPersona] = useState(false)
  const [editingPersona, setEditingPersona] = useState<BuyerPersona | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestedPersona[]>([])
  const [suggesting, setSuggesting] = useState(false)
  const [addedSuggestions, setAddedSuggestions] = useState<Set<number>>(new Set())
  const [showICPPicker, setShowICPPicker] = useState(false)

  const personas: BuyerPersona[] = group.buyer_personas || []

  const handleDeletePersona = async (id: string) => {
    try {
      await deletePersona(id)
    } catch {
      toast.error('Error al eliminar persona')
    }
  }

  const handleSuggest = async (icpProfileId: string | null) => {
    setSuggesting(true)
    setAddedSuggestions(new Set())
    try {
      const result = icpProfileId
        ? await suggestBuyerPersonas(icpProfileId, 'icpProfileId')
        : await suggestBuyerPersonas(group.id, 'personaGroupId')
      setSuggestions(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al sugerir personas')
    } finally {
      setSuggesting(false)
    }
  }

  const handleAddSuggestion = async (s: SuggestedPersona, idx: number) => {
    if (!user) return
    try {
      await addPersona({
        persona_group_id: group.id,
        icp_profile_id: null,
        account_map_id: null,
        owner_id: user.id,
        name: s.name,
        title_keywords: s.title_keywords || [],
        seniority: s.seniority || null,
        department: s.department || null,
        max_per_company: 2,
        description: s.description || null,
        role_in_buying_committee: (s.role_in_buying_committee as BuyingCommitteeRole) || null,
        priority: personas.length + 1,
        is_required: true,
        departments: s.departments || [],
        title_keywords_by_tier: s.title_keywords_by_tier || { enterprise: [], mid_market: [], startup_smb: [] },
        seniority_by_tier: s.seniority_by_tier || { enterprise: [], mid_market: [], startup_smb: [] },
      })
      setAddedSuggestions((prev) => new Set([...prev, idx]))
      toast.success(`"${s.name}" added`)
    } catch {
      toast.error('Error al agregar persona')
    }
  }

  const isOwner = user?.id === group.owner_id

  return (
    <Card className="overflow-hidden">
      {/* Group header */}
      <CardHeader
        className="cursor-pointer select-none py-3 px-4"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {expanded
              ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            }
            <CardTitle className="text-sm font-semibold truncate">{group.name}</CardTitle>
            <Badge
              variant="outline"
              className={`text-[10px] h-5 shrink-0 ${
                group.scope === 'organization'
                  ? 'border-purple-500/50 text-purple-600 dark:text-purple-400'
                  : 'border-blue-500/50 text-blue-600 dark:text-blue-400'
              }`}
            >
              {group.scope === 'organization' ? <Building2 className="mr-1 h-2.5 w-2.5" /> : <UserCircle className="mr-1 h-2.5 w-2.5" />}
              {group.scope === 'organization' ? 'Organization' : 'Personal'}
            </Badge>
            <span className="text-xs text-muted-foreground shrink-0">{personas.length} persona{personas.length !== 1 ? 's' : ''}</span>
          </div>
          {isOwner && (
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onEdit} title="Editar grupo">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onDelete} title="Eliminar grupo">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        {group.description && !expanded && (
          <p className="text-xs text-muted-foreground ml-6 line-clamp-1">{group.description}</p>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 pb-4 px-4">
          {group.description && (
            <p className="text-xs text-muted-foreground mb-3 ml-1">{group.description}</p>
          )}

          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-3">
            <FeatureGate flag="acctmap_persona_suggest">
              <Button variant="outline" size="sm" onClick={() => setShowICPPicker(true)} disabled={suggesting}>
                {suggesting
                  ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Suggesting...</>
                  : <><Sparkles className="mr-1.5 h-3.5 w-3.5" />Suggest Personas</>
                }
              </Button>
            </FeatureGate>
            <LLMModelSelector />
            <Button size="sm" onClick={() => { setEditingPersona(null); setShowAddPersona(true) }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Persona
            </Button>
          </div>

          {/* Personas table */}
          {personas.length === 0 && suggestions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No personas yet. Add personas or use AI to suggest them.
            </p>
          ) : (
            <>
              {personas.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Keywords by Tier</TableHead>
                      <TableHead className="w-20 text-center">Max</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...personas].sort((a, b) => {
                      if (a.is_required !== b.is_required) return a.is_required ? -1 : 1
                      return a.priority - b.priority
                    }).map((persona) => {
                      const roleConfig = persona.role_in_buying_committee
                        ? BUYING_ROLE_CONFIG[persona.role_in_buying_committee as BuyingCommitteeRole]
                        : null
                      const tierKw = persona.title_keywords_by_tier || { enterprise: [], mid_market: [], startup_smb: [] }
                      const eCount = tierKw.enterprise?.length || 0
                      const mCount = tierKw.mid_market?.length || 0
                      const sCount = tierKw.startup_smb?.length || 0
                      const hasTierData = eCount + mCount + sCount > 0
                      return (
                        <TableRow key={persona.id}>
                          <TableCell>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-muted-foreground font-mono">{persona.priority}.</span>
                              <span className="font-medium">{persona.name}</span>
                              {persona.is_required && (
                                <span className="text-amber-500 text-xs" title="Required">*</span>
                              )}
                              {roleConfig && (
                                <Badge variant="outline" className={`text-[10px] h-4 ${roleConfig.color}`}>
                                  {roleConfig.label}
                                </Badge>
                              )}
                            </div>
                            {persona.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{persona.description}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            {hasTierData ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span title="Enterprise keywords">E:{eCount}</span>
                                <span title="Mid-market keywords">M:{mCount}</span>
                                <span title="Startup/SMB keywords">S:{sCount}</span>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {(persona.title_keywords || []).slice(0, 3).map((kw) => (
                                  <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>
                                ))}
                                {(persona.title_keywords || []).length > 3 && (
                                  <Badge variant="outline" className="text-xs">+{(persona.title_keywords || []).length - 3}</Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{persona.max_per_company}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                                onClick={() => { setEditingPersona(persona); setShowAddPersona(true) }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeletePersona(persona.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}

              {/* AI Suggestions */}
              {suggestions.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">AI Suggestions</p>
                  {suggestions.map((s, i) => {
                    const roleConfig = s.role_in_buying_committee
                      ? BUYING_ROLE_CONFIG[s.role_in_buying_committee as BuyingCommitteeRole]
                      : null
                    const added = addedSuggestions.has(i)
                    return (
                      <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-dashed p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-sm">{s.name}</span>
                            {roleConfig && (
                              <Badge variant="outline" className={`text-[10px] h-4 ${roleConfig.color}`}>
                                {roleConfig.label}
                              </Badge>
                            )}
                          </div>
                          {s.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.description}</p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(s.title_keywords || []).slice(0, 4).map((kw) => (
                              <Badge key={kw} variant="secondary" className="text-[10px]">{kw}</Badge>
                            ))}
                          </div>
                        </div>
                        <Button
                          size="sm" variant={added ? 'secondary' : 'outline'}
                          className="shrink-0"
                          disabled={added}
                          onClick={() => handleAddSuggestion(s, i)}
                        >
                          {added ? 'Agregado' : <><Plus className="mr-1 h-3.5 w-3.5" />Agregar</>}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ICP Picker for AI suggestions */}
          <ICPPickerDialog
            open={showICPPicker}
            onOpenChange={setShowICPPicker}
            onSelect={handleSuggest}
          />

          {/* Add Persona Dialog */}
          {showAddPersona && user && (
            <AddPersonaDialog
              open={showAddPersona}
              onOpenChange={(v) => { setShowAddPersona(v); if (!v) setEditingPersona(null) }}
              accountMapId={group.id}
              icpProfileId={undefined}
              personaGroupId={group.id}
              ownerId={user.id}
              onAdd={addPersona}
              onUpdate={updatePersona}
              persona={editingPersona}
            />
          )}
        </CardContent>
      )}
    </Card>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export function BuyerPersonas() {
  const {
    personaGroups,
    personaGroupsLoading,
    addPersonaGroup,
    updatePersonaGroup,
    deletePersonaGroup,
  } = useAccountMapping()

  const [showNewGroup, setShowNewGroup] = useState(false)
  const [editingGroup, setEditingGroup] = useState<PersonaGroup | null>(null)
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreate = async (data: { name: string; description: string | null; scope: 'personal' | 'organization' }) => {
    const group = await addPersonaGroup(data)
    setExpandedGroups((prev) => new Set([...prev, group.id]))
    toast.success(`Grupo "${data.name}" creado`)
  }

  const handleUpdate = async (data: { name: string; description: string | null; scope: 'personal' | 'organization' }) => {
    if (!editingGroup) return
    await updatePersonaGroup(editingGroup.id, data)
    toast.success('Grupo actualizado')
  }

  const handleDelete = async () => {
    if (!deletingGroupId) return
    try {
      await deletePersonaGroup(deletingGroupId)
      toast.success('Grupo eliminado')
    } catch {
      toast.error('Error al eliminar grupo')
    } finally {
      setDeletingGroupId(null)
    }
  }

  return (
    <PageTransition className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Buyer Personas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define the roles you're targeting for Sales Navigator searches. Organize them in groups.
          </p>
        </div>
        <Button onClick={() => setShowNewGroup(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New Group
        </Button>
      </div>

      {/* Groups */}
      {personaGroupsLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
        </div>
      ) : personaGroups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium">Sin grupos de personas aún</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Create a group to organize your buyer personas.
              </p>
            </div>
            <Button variant="outline" onClick={() => setShowNewGroup(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New Group
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {personaGroups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              expanded={expandedGroups.has(group.id)}
              onToggle={() => toggleExpand(group.id)}
              onEdit={() => { setEditingGroup(group); setShowNewGroup(true) }}
              onDelete={() => setDeletingGroupId(group.id)}
            />
          ))}
        </div>
      )}

      {/* New / Edit group dialog */}
      <GroupDialog
        open={showNewGroup}
        onOpenChange={(v) => { setShowNewGroup(v); if (!v) setEditingGroup(null) }}
        initial={editingGroup}
        onSave={editingGroup ? handleUpdate : handleCreate}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingGroupId} onOpenChange={(v) => !v && setDeletingGroupId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar grupo de persona?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto eliminará permanentemente el grupo y todas las personas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  )
}
