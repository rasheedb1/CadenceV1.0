import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import type { SignalType, SignalCategory } from '@/types/signals'
import { SIGNAL_CATEGORIES } from '@/types/signals'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Loader2,
  Zap,
  DollarSign,
  Globe,
  UserPlus,
  Rocket,
  TrendingUp,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Save,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'

// Map icon string names to Lucide components
const ICON_MAP: Record<string, React.ElementType> = {
  DollarSign, Globe, UserPlus, Rocket, TrendingUp, MessageSquare,
  Zap,
}

function getCategoryIcon(category: SignalCategory): React.ElementType {
  const iconName = SIGNAL_CATEGORIES[category]?.icon
  return ICON_MAP[iconName] || Zap
}

interface LocalConfig {
  signal_type_id: string
  enabled: boolean
  priority: number
  custom_query: string
}

export function SignalsTab() {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const queryClient = useQueryClient()

  const [localConfigs, setLocalConfigs] = useState<Record<string, LocalConfig>>({})
  const [expandedCategories, setExpandedCategories] = useState<Set<SignalCategory>>(new Set())
  const [hasChanges, setHasChanges] = useState(false)
  const [saving, setSaving] = useState(false)

  // Fetch all signal types (global catalog)
  const { data: signalTypes = [], isLoading: typesLoading } = useQuery({
    queryKey: ['signal-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('signal_types')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data || []) as SignalType[]
    },
  })

  // Fetch user's signal configs
  const { data: savedConfigs = [], isLoading: configsLoading } = useQuery({
    queryKey: ['signal-configs', orgId, user?.id],
    queryFn: async () => {
      if (!user || !orgId) return []
      const { data, error } = await supabase
        .from('signal_configs')
        .select('*')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
      if (error) throw error
      return data || []
    },
    enabled: !!user && !!orgId,
  })

  // Initialize local configs from saved configs + defaults
  useEffect(() => {
    if (signalTypes.length === 0) return

    const configs: Record<string, LocalConfig> = {}
    for (const st of signalTypes) {
      const saved = savedConfigs.find((c: { signal_type_id: string }) => c.signal_type_id === st.id)
      configs[st.id] = {
        signal_type_id: st.id,
        enabled: saved ? saved.enabled : st.default_enabled,
        priority: saved ? saved.priority : 5,
        custom_query: saved?.custom_query || '',
      }
    }
    setLocalConfigs(configs)
    setHasChanges(false)
  }, [signalTypes, savedConfigs])

  // Group signal types by category
  const categories = Object.keys(SIGNAL_CATEGORIES) as SignalCategory[]
  const grouped = categories.map(cat => ({
    category: cat,
    ...SIGNAL_CATEGORIES[cat],
    signals: signalTypes.filter(s => s.category === cat),
  }))

  const toggleCategory = (cat: SignalCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const updateConfig = (signalTypeId: string, updates: Partial<LocalConfig>) => {
    setLocalConfigs(prev => ({
      ...prev,
      [signalTypeId]: { ...prev[signalTypeId], ...updates },
    }))
    setHasChanges(true)
  }

  const enabledCount = Object.values(localConfigs).filter(c => c.enabled).length

  // Save all configs
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user || !orgId) throw new Error('Not authenticated')

      const upserts = Object.values(localConfigs).map(c => ({
        user_id: user.id,
        org_id: orgId,
        signal_type_id: c.signal_type_id,
        enabled: c.enabled,
        priority: c.priority,
        custom_query: c.custom_query || null,
        updated_at: new Date().toISOString(),
      }))

      const { error } = await supabase
        .from('signal_configs')
        .upsert(upserts, { onConflict: 'user_id,org_id,signal_type_id' })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signal-configs'] })
      setHasChanges(false)
      toast.success('Señales guardadas')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al guardar'),
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveMutation.mutateAsync()
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    const configs: Record<string, LocalConfig> = {}
    for (const st of signalTypes) {
      configs[st.id] = {
        signal_type_id: st.id,
        enabled: st.default_enabled,
        priority: 5,
        custom_query: '',
      }
    }
    setLocalConfigs(configs)
    setHasChanges(true)
  }

  const isLoading = typesLoading || configsLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-amber-500" />
            Señales de Venta
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Configura que señales buscar automaticamente cuando generas un mensaje con AI.
            Las señales detectadas se inyectan como "hooks" para hacer el mensaje mas relevante.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-sm">
                {enabledCount} de {signalTypes.length} activas
              </Badge>
              <span className="text-xs text-muted-foreground">
                Mas señales = mas tiempo de generacion (~2-3s por señal)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={saving}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Defaults
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || saving}
              >
                {saving ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Signal categories */}
      {grouped.map(group => {
        const CategoryIcon = getCategoryIcon(group.category)
        const expanded = expandedCategories.has(group.category)
        const enabledInGroup = group.signals.filter(s => localConfigs[s.id]?.enabled).length

        return (
          <Card key={group.category}>
            <CardHeader className="pb-0 cursor-pointer" onClick={() => toggleCategory(group.category)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <CategoryIcon className="h-5 w-5" />
                  <CardTitle className="text-base">{group.label}</CardTitle>
                  <Badge variant="outline" className={`text-xs ${group.color}`}>
                    {enabledInGroup}/{group.signals.length}
                  </Badge>
                </div>
                {/* Quick toggle all in category */}
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <span className="text-xs text-muted-foreground">Todas</span>
                  <Switch
                    checked={enabledInGroup === group.signals.length}
                    onCheckedChange={(checked) => {
                      for (const s of group.signals) {
                        updateConfig(s.id, { enabled: checked })
                      }
                    }}
                  />
                </div>
              </div>
            </CardHeader>

            {expanded && (
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {group.signals.map(signal => {
                    const config = localConfigs[signal.id]
                    if (!config) return null

                    return (
                      <div
                        key={signal.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          config.enabled
                            ? 'bg-background border-border'
                            : 'bg-muted/30 border-transparent opacity-60'
                        }`}
                      >
                        <Switch
                          checked={config.enabled}
                          onCheckedChange={(checked) => updateConfig(signal.id, { enabled: checked })}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{signal.name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {signal.description}
                          </p>

                          {/* Custom query (only when enabled and expanded) */}
                          {config.enabled && (
                            <div className="mt-2">
                              <Input
                                placeholder="Query personalizada (opcional)"
                                value={config.custom_query}
                                onChange={e => updateConfig(signal.id, { custom_query: e.target.value })}
                                className="h-7 text-xs"
                              />
                            </div>
                          )}
                        </div>

                        {/* Priority selector */}
                        {config.enabled && (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[10px] text-muted-foreground">Prioridad</span>
                            <select
                              value={config.priority}
                              onChange={e => updateConfig(signal.id, { priority: parseInt(e.target.value) })}
                              className="h-7 text-xs rounded border bg-background px-1.5"
                            >
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}
