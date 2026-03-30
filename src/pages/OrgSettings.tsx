import { PageTransition } from '@/components/PageTransition'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useOrg } from '@/contexts/OrgContext'
import { usePermissions } from '@/hooks/usePermissions'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Save, Key, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

export function OrgSettings() {
  const { org, refreshOrgs } = useOrg()
  const perms = usePermissions()
  const [name, setName] = useState(org?.name || '')
  const [saving, setSaving] = useState(false)

  // Integration keys state
  const [apolloKey, setApolloKey] = useState('')
  const [firecrawlKey, setFirecrawlKey] = useState('')
  const [showApolloKey, setShowApolloKey] = useState(false)
  const [showFirecrawlKey, setShowFirecrawlKey] = useState(false)
  const [savingKeys, setSavingKeys] = useState(false)
  const [keysLoaded, setKeysLoaded] = useState(false)

  if (!org) return null

  const canEdit = perms.org_settings_edit

  // Load existing integration keys
  useEffect(() => {
    if (!org?.id) return
    ;(async () => {
      const { data } = await supabase
        .from('org_integrations')
        .select('apollo_api_key, firecrawl_api_key')
        .eq('org_id', org.id)
        .single()
      if (data) {
        setApolloKey(data.apollo_api_key || '')
        setFirecrawlKey(data.firecrawl_api_key || '')
      }
      setKeysLoaded(true)
    })()
  }, [org?.id])

  const handleSave = async () => {
    if (!canEdit || !name.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ name: name.trim() })
        .eq('id', org.id)

      if (error) throw error
      refreshOrgs()
      toast.success('Organización actualizada')
    } catch {
      toast.error('Failed to update organization')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveKeys = async () => {
    if (!canEdit || !org) return
    setSavingKeys(true)
    try {
      const { error } = await supabase
        .from('org_integrations')
        .upsert({
          org_id: org.id,
          apollo_api_key: apolloKey.trim() || null,
          firecrawl_api_key: firecrawlKey.trim() || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id' })

      if (error) throw error
      toast.success('API keys saved')
    } catch {
      toast.error('Failed to save API keys')
    } finally {
      setSavingKeys(false)
    }
  }

  return (
    <PageTransition className="p-8">
      <div className="mb-8">
        <h1 className="text-[28px] font-bold tracking-tight font-heading">Configuración</h1>
        <p className="text-muted-foreground">Gestiona la configuración de tu cuenta</p>
        <div className="flex gap-2 mt-4">
          <Link to="/settings" className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:bg-accent">
            Account
          </Link>
          <Link to="/settings/organization" className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground">
            Organization
          </Link>
          <Link to="/settings/members" className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:bg-accent">
            Members
          </Link>
        </div>
      </div>

      <div className="max-w-2xl space-y-6">

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            General
          </CardTitle>
          <CardDescription>Basic organization information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={org.slug} disabled className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">URL identifier, cannot be changed</p>
          </div>
          <div className="space-y-2">
            <Label>Organization ID</Label>
            <Input value={org.id} disabled className="text-muted-foreground font-mono text-xs" />
          </div>
          {canEdit && (
            <Button onClick={handleSave} disabled={saving || name === org.name}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Integrations
          </CardTitle>
          <CardDescription>Configure API keys for enrichment services. Each organization uses its own keys.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apollo-key">Apollo.io API Key</Label>
            <p className="text-xs text-muted-foreground">
              Used for prospect enrichment (emails, phones, company data).{' '}
              <a href="https://app.apollo.io/#/settings/integrations/api" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Get your key
              </a>
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="apollo-key"
                  type={showApolloKey ? 'text' : 'password'}
                  value={apolloKey}
                  onChange={e => setApolloKey(e.target.value)}
                  disabled={!canEdit || !keysLoaded}
                  placeholder="Ingresa tu API key de Apollo..."
                  className="pr-10 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowApolloKey(!showApolloKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApolloKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="firecrawl-key">Firecrawl API Key <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <p className="text-xs text-muted-foreground">
              Fallback for email discovery via website scraping when Apollo has no data.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="firecrawl-key"
                  type={showFirecrawlKey ? 'text' : 'password'}
                  value={firecrawlKey}
                  onChange={e => setFirecrawlKey(e.target.value)}
                  disabled={!canEdit || !keysLoaded}
                  placeholder="Ingresa tu API key de Firecrawl..."
                  className="pr-10 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowFirecrawlKey(!showFirecrawlKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showFirecrawlKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {canEdit && (
            <Button onClick={handleSaveKeys} disabled={savingKeys || !keysLoaded}>
              <Save className="h-4 w-4 mr-2" />
              {savingKeys ? 'Guardando...' : 'Guardar API Keys'}
            </Button>
          )}
        </CardContent>
      </Card>
      </div>
    </PageTransition>
  )
}
