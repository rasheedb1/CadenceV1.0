import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccountMapping } from '@/contexts/AccountMappingContext'
import { useICPProfiles, useICPProfileUsage, useICPProfileMutations } from '@/hooks/useICPProfiles'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import { Plus, Target, MoreVertical, Pencil, Trash2, Building2, Users, UserSearch, Brain, Map, UserCircle, ChevronDown, ExternalLink, Wand2, FilePenLine, Loader2 } from 'lucide-react'
import { AddPersonaDialog } from '@/components/account-mapping/AddPersonaDialog'
import { PermissionGate } from '@/components/PermissionGate'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { BuyerPersona, BuyingCommitteeRole } from '@/types/account-mapping'
import { BUYING_ROLE_CONFIG } from '@/types/account-mapping'
import { PageTransition } from '@/components/PageTransition'

type TabId = 'maps' | 'icp-profiles' | 'buyer-personas'

interface SuggestedPersona {
  name: string
  title_keywords: string[]
  seniority: string
  department: string
  reasoning?: string
  description?: string
  role_in_buying_committee?: string
  departments?: string[]
  title_keywords_by_tier?: { enterprise: string[]; mid_market: string[]; startup_smb: string[] }
  seniority_by_tier?: { enterprise: string[]; mid_market: string[]; startup_smb: string[] }
}

type PersonaWithProfile = BuyerPersona & {
  icp_profiles: { id: string; name: string } | null
}

export function AccountMapping() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { orgId } = useOrg()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { accountMaps, isLoading, createAccountMap, deleteAccountMap } = useAccountMapping()
  const { data: icpProfiles = [], isLoading: icpLoading } = useICPProfiles()
  const { data: usageMap } = useICPProfileUsage()
  const { createProfile, deleteProfile } = useICPProfileMutations()

  // Derive active tab from URL param (so sidebar links work even when already on this page)
  const activeTab = (searchParams.get('tab') as TabId) || 'maps'
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  // Buyer persona groups collapse state
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => ({ ...prev, [id]: prev[id] === false ? true : false }))

  // Add Persona choice modal
  const [isAddPersonaChoiceOpen, setIsAddPersonaChoiceOpen] = useState(false)
  const [isManualPersonaOpen, setIsManualPersonaOpen] = useState(false)
  // AI generation state
  const [isAIPersonaOpen, setIsAIPersonaOpen] = useState(false)
  const [aiProductDescription, setAIProductDescription] = useState('')
  const [aiSuggesting, setAISuggesting] = useState(false)
  const [aiSuggestions, setAISuggestions] = useState<SuggestedPersona[]>([])
  const [addingPersonaId, setAddingPersonaId] = useState<number | null>(null)

  // Insert a standalone persona (no icp_profile_id, no account_map_id)
  const onAddStandalonePersona = async (
    persona: Omit<BuyerPersona, 'id' | 'created_at' | 'updated_at' | 'org_id'>
  ): Promise<BuyerPersona | null> => {
    const { data, error } = await supabase
      .from('buyer_personas')
      .insert({
        ...persona,
        icp_profile_id: null,
        account_map_id: null,
        org_id: orgId,
        owner_id: user!.id,
      })
      .select()
      .single()
    if (error) { toast.error(error.message); return null }
    queryClient.invalidateQueries({ queryKey: ['all-buyer-personas', orgId, user?.id] })
    toast.success('Persona created')
    return data as BuyerPersona
  }

  // Add a suggested persona as standalone
  const handleAddSuggestedPersona = async (persona: SuggestedPersona, idx: number) => {
    setAddingPersonaId(idx)
    try {
      await onAddStandalonePersona({
        account_map_id: null,
        icp_profile_id: null,
        persona_group_id: null,
        owner_id: user!.id,
        name: persona.name,
        title_keywords: persona.title_keywords || [],
        seniority: persona.seniority || null,
        department: persona.department || null,
        max_per_company: 3,
        description: persona.description || null,
        role_in_buying_committee: (persona.role_in_buying_committee as BuyerPersona['role_in_buying_committee']) || null,
        priority: idx + 1,
        is_required: idx === 0,
        departments: persona.departments || [],
        title_keywords_by_tier: persona.title_keywords_by_tier || { enterprise: [], mid_market: [], startup_smb: [] },
        seniority_by_tier: persona.seniority_by_tier || { enterprise: [], mid_market: [], startup_smb: [] },
      })
    } finally {
      setAddingPersonaId(null)
    }
  }

  const handleGeneratePersonasWithAI = async () => {
    if (!aiProductDescription.trim()) return
    setAISuggesting(true)
    setAISuggestions([])
    try {
      const resp = await supabase.functions.invoke('suggest-buyer-personas', {
        body: { productDescription: aiProductDescription.trim() },
      })
      if (resp.error) throw new Error(resp.error.message)
      setAISuggestions(resp.data?.personas || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error generating personas')
    } finally {
      setAISuggesting(false)
    }
  }

  // ICP Profile creation
  const [isCreateProfileOpen, setIsCreateProfileOpen] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [creatingProfile, setCreatingProfile] = useState(false)

  // All buyer personas across all ICP profiles
  const { data: allPersonas = [], isLoading: personasLoading } = useQuery({
    queryKey: ['all-buyer-personas', orgId, user?.id],
    queryFn: async () => {
      if (!orgId || !user) return []
      const { data, error } = await supabase
        .from('buyer_personas')
        .select('*, icp_profiles(id, name)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as PersonaWithProfile[]
    },
    enabled: !!orgId && !!user,
  })

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const map = await createAccountMap(newName, newDescription)
      setIsCreateOpen(false)
      setNewName('')
      setNewDescription('')
      if (map) {
        navigate(`/account-mapping/${map.id}`)
      }
    } catch (error) {
      console.error('Failed to create account map:', error)
      alert(error instanceof Error ? error.message : 'Failed to create account map.')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('¿Eliminar este mapa de cuentas y todos sus datos?')) {
      await deleteAccountMap(id)
    }
  }

  const handleCreateProfile = async () => {
    if (!profileName.trim()) return
    setCreatingProfile(true)
    try {
      const profile = await createProfile.mutateAsync({ name: profileName.trim() })
      setIsCreateProfileOpen(false)
      setProfileName('')
      if (profile) {
        navigate(`/account-mapping/icp-profiles/${profile.id}`)
      }
    } catch {
      // Error handled in mutation
    } finally {
      setCreatingProfile(false)
    }
  }

  const handleDeleteProfile = async (id: string) => {
    const usage = usageMap?.get(id) || 0
    if (usage > 0) {
      toast.error(`This profile is used by ${usage} account map(s). Unlink them first.`)
      return
    }
    if (confirm('¿Eliminar este perfil ICP y todas sus personas?')) {
      await deleteProfile.mutateAsync(id)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  // tabs hidden - ICP/Personas moved to One Time Use section

  return (
    <PageTransition className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading">
            {activeTab === 'icp-profiles' ? 'ICP Setup' : activeTab === 'buyer-personas' ? 'Buying Personas' : 'Search Companies & Leads'}
          </h1>
          <p className="text-muted-foreground">
            {activeTab === 'icp-profiles' ? 'Define your Ideal Customer Profile' : activeTab === 'buyer-personas' ? 'Define the buyer personas for your outreach' : 'Find prospects and build target lists'}
          </p>
        </div>

        {activeTab === 'maps' && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <PermissionGate permission="account_mapping_create">
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Account Map
                </Button>
              </DialogTrigger>
            </PermissionGate>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Account Map</DialogTitle>
                <DialogDescription>
                  Define a new Ideal Customer Profile to target
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="map-name">Name</Label>
                  <Input
                    id="map-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Enterprise Fintech"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="map-description">Description (optional)</Label>
                  <Input
                    id="map-description"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="e.g., Companies processing $1B+ in payments"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                  {creating ? 'Creando...' : 'Crear'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {activeTab === 'icp-profiles' && (
          <Dialog open={isCreateProfileOpen} onOpenChange={setIsCreateProfileOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New ICP Profile
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create ICP Profile</DialogTitle>
                <DialogDescription>
                  Create a reusable ICP profile with buyer personas that can be linked to multiple account maps.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="profile-name">Name</Label>
                  <Input
                    id="profile-name"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="e.g., Enterprise SaaS ICP"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateProfileOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateProfile} disabled={creatingProfile || !profileName.trim()}>
                  {creatingProfile ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {activeTab === 'buyer-personas' && (
          <Button onClick={() => setIsAddPersonaChoiceOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Persona
          </Button>
        )}
      </div>

      {/* Tab bar - hidden since ICP/Personas moved to One Time Use */}

      {/* Account Maps Tab */}
      {activeTab === 'maps' && (
        <>
          {accountMaps.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Target className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-medium">No account maps yet</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Create your first account map to define your ICP and find prospects
                </p>
                <PermissionGate permission="account_mapping_create">
                  <Button onClick={() => setIsCreateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Account Map
                  </Button>
                </PermissionGate>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {accountMaps.map((map) => {
                const companyCount = map.account_map_companies?.length || 0
                const prospectCount = map.prospects?.length || 0
                const personaCount = map.buyer_personas?.length || 0

                return (
                  <Card
                    key={map.id}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => navigate(`/account-mapping/${map.id}`)}
                  >
                    <CardHeader className="flex flex-row items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{map.name}</CardTitle>
                        {map.description && (
                          <CardDescription className="mt-1">{map.description}</CardDescription>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/account-mapping/${map.id}`)
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(map.id)
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {companyCount} {companyCount === 1 ? 'company' : 'companies'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {personaCount} {personaCount === 1 ? 'persona' : 'personas'}
                        </span>
                        <span className="flex items-center gap-1">
                          <UserSearch className="h-3.5 w-3.5" />
                          {prospectCount} {prospectCount === 1 ? 'prospect' : 'prospects'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ICP Profiles Tab */}
      {activeTab === 'icp-profiles' && (
        <>
          {icpLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : icpProfiles.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Brain className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-medium">No ICP Profiles yet</h3>
                <p className="mb-4 text-sm text-muted-foreground text-center max-w-md">
                  Create reusable ICP profiles with buyer personas. Link them to multiple account maps without redefining from scratch.
                </p>
                <Button onClick={() => setIsCreateProfileOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create ICP Profile
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {icpProfiles.map((profile) => {
                const usage = usageMap?.get(profile.id) || 0
                return (
                  <Card
                    key={profile.id}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => navigate(`/account-mapping/icp-profiles/${profile.id}`)}
                  >
                    <CardHeader className="flex flex-row items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg">{profile.name}</CardTitle>
                        {profile.description && (
                          <CardDescription className="mt-1 line-clamp-2">{profile.description}</CardDescription>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/account-mapping/icp-profiles/${profile.id}`)
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteProfile(profile.id)
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {(profile as unknown as { persona_count: number }).persona_count} {(profile as unknown as { persona_count: number }).persona_count === 1 ? 'persona' : 'personas'}
                        </span>
                        {usage > 0 && (
                          <span className="flex items-center gap-1">
                            <Map className="h-3.5 w-3.5" />
                            {usage} {usage === 1 ? 'map' : 'maps'}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Buying Personas Tab — grouped by ICP Profile */}
      {activeTab === 'buyer-personas' && (
        <>
          {personasLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : allPersonas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <UserCircle className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-medium">No buying personas yet</h3>
                <p className="mb-4 text-sm text-muted-foreground text-center max-w-md">
                  Create your first buying persona manually or let AI suggest them based on your product.
                </p>
                <Button onClick={() => setIsAddPersonaChoiceOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Persona
                </Button>
              </CardContent>
            </Card>
          ) : (() => {
            // Group by ICP Profile; standalone (no icp_profile_id) → '__standalone__'
            const STANDALONE = '__standalone__'
            const groups: Record<string, { profileId: string; profileName: string; isStandalone: boolean; personas: PersonaWithProfile[] }> = {}
            for (const persona of allPersonas) {
              const pid = persona.icp_profile_id || STANDALONE
              if (!groups[pid]) {
                groups[pid] = {
                  profileId: pid,
                  profileName: pid === STANDALONE ? 'Sin perfil ICP' : (persona.icp_profiles?.name || 'Unknown Profile'),
                  isStandalone: pid === STANDALONE,
                  personas: [],
                }
              }
              groups[pid].personas.push(persona)
            }
            // Sort within each group
            for (const g of Object.values(groups)) {
              g.personas.sort((a, b) => {
                if (a.is_required !== b.is_required) return a.is_required ? -1 : 1
                return a.priority - b.priority
              })
            }
            // ICP-linked groups alphabetically, standalone last
            const sortedGroups = Object.values(groups).sort((a, b) => {
              if (a.isStandalone) return 1
              if (b.isStandalone) return -1
              return a.profileName.localeCompare(b.profileName)
            })

            return (
              <div className="space-y-3">
                {sortedGroups.map((group) => {
                  const isOpen = openGroups[group.profileId] !== false // default open
                  return (
                    <Card key={group.profileId} className="overflow-hidden">
                      {/* Group header */}
                      <button
                        onClick={() => toggleGroup(group.profileId)}
                        className="flex w-full items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors border-b border-border/60"
                      >
                        <div className="flex items-center gap-3">
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${!isOpen ? '-rotate-90' : ''}`}
                          />
                          <span className="font-semibold text-sm">{group.profileName}</span>
                          <Badge variant="secondary" className="text-xs">
                            {group.personas.length} {group.personas.length === 1 ? 'persona' : 'personas'}
                          </Badge>
                        </div>
                        {!group.isStandalone && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/account-mapping/icp-profiles/${group.profileId}`)
                            }}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Edit profile
                          </Button>
                        )}
                      </button>

                      {/* Personas table */}
                      {isOpen && (
                        <CardContent className="p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Keywords by Tier</TableHead>
                                <TableHead className="w-24 text-center">Max</TableHead>
                                <TableHead className="w-20" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.personas.map((persona) => {
                                const roleConfig = persona.role_in_buying_committee
                                  ? BUYING_ROLE_CONFIG[persona.role_in_buying_committee as BuyingCommitteeRole]
                                  : null
                                const tierKw = persona.title_keywords_by_tier || { enterprise: [], mid_market: [], startup_smb: [] }
                                const eCount = tierKw.enterprise?.length || 0
                                const mCount = tierKw.mid_market?.length || 0
                                const sCount = tierKw.startup_smb?.length || 0
                                const hasTierData = eCount + mCount + sCount > 0
                                return (
                                  <TableRow
                                    key={persona.id}
                                    className="cursor-pointer hover:bg-muted/50"
                                    onClick={() =>
                                      persona.icp_profile_id &&
                                      navigate(`/account-mapping/icp-profiles/${persona.icp_profile_id}`)
                                    }
                                  >
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
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          persona.icp_profile_id &&
                                            navigate(`/account-mapping/icp-profiles/${persona.icp_profile_id}`)
                                        }}
                                        title="Editar persona"
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </CardContent>
                      )}
                    </Card>
                  )
                })}
              </div>
            )
          })()}
        </>
      )}

      {/* ── Add Persona choice modal ────────────────────────────────── */}
      <Dialog open={isAddPersonaChoiceOpen} onOpenChange={setIsAddPersonaChoiceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Buying Persona</DialogTitle>
            <DialogDescription>Choose how you want to create the persona</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              onClick={() => { setIsAddPersonaChoiceOpen(false); setIsManualPersonaOpen(true) }}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors text-left"
            >
              <FilePenLine className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Manually</p>
                <p className="text-xs text-muted-foreground mt-0.5">Fill in the form yourself</p>
              </div>
            </button>
            <button
              onClick={() => { setIsAddPersonaChoiceOpen(false); setIsAIPersonaOpen(true) }}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors text-left"
            >
              <Wand2 className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium text-sm">Generate with AI</p>
                <p className="text-xs text-muted-foreground mt-0.5">Describe your product, AI suggests personas</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Manual persona dialog (standalone) ─────────────────────── */}
      <AddPersonaDialog
        open={isManualPersonaOpen}
        onOpenChange={setIsManualPersonaOpen}
        accountMapId=""
        icpProfileId=""
        ownerId={user?.id || ''}
        onAdd={onAddStandalonePersona}
      />

      {/* ── AI persona generation dialog ─────────────────────────────── */}
      <Dialog open={isAIPersonaOpen} onOpenChange={(open) => {
        setIsAIPersonaOpen(open)
        if (!open) { setAISuggestions([]); setAIProductDescription('') }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Personas with AI</DialogTitle>
            <DialogDescription>Describe your product and target market — AI will suggest buyer personas</DialogDescription>
          </DialogHeader>

          {aiSuggestions.length === 0 ? (
            <div className="space-y-3 py-1">
              <Label htmlFor="ai-desc">Product / Company Description</Label>
              <Textarea
                id="ai-desc"
                rows={4}
                value={aiProductDescription}
                onChange={(e) => setAIProductDescription(e.target.value)}
                placeholder="e.g. We sell a payment orchestration platform to fintech companies and online marketplaces that need to process payments globally..."
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAIPersonaOpen(false)}>Cancelar</Button>
                <Button
                  onClick={handleGeneratePersonasWithAI}
                  disabled={aiSuggesting || !aiProductDescription.trim()}
                >
                  {aiSuggesting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
                  ) : (
                    <><Wand2 className="mr-2 h-4 w-4" /> Generate</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-2 py-1 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-muted-foreground mb-3">{aiSuggestions.length} personas suggested — click Add to save</p>
              {aiSuggestions.map((persona, idx) => {
                const roleConfig = persona.role_in_buying_committee
                  ? BUYING_ROLE_CONFIG[persona.role_in_buying_committee as BuyingCommitteeRole]
                  : null
                return (
                  <div key={idx} className="flex items-start gap-3 rounded-lg border border-border p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{persona.name}</span>
                        {roleConfig && (
                          <Badge variant="outline" className={`text-[10px] h-4 ${roleConfig.color}`}>
                            {roleConfig.label}
                          </Badge>
                        )}
                      </div>
                      {persona.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{persona.description}</p>
                      )}
                      {persona.title_keywords?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {persona.title_keywords.slice(0, 4).map((kw: string) => (
                            <Badge key={kw} variant="secondary" className="text-[10px]">{kw}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={addingPersonaId === idx}
                      onClick={() => handleAddSuggestedPersona(persona, idx)}
                    >
                      {addingPersonaId === idx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                )
              })}
              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => { setAISuggestions([]); setAIProductDescription('') }}>
                  Regenerate
                </Button>
                <Button onClick={() => { setIsAIPersonaOpen(false); setAISuggestions([]); setAIProductDescription('') }}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}
