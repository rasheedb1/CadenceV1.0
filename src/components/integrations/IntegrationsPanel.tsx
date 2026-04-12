/**
 * Integrations Panel — unified connection management for all integrations.
 * OAuth integrations: Google (Gmail+Calendar), Salesforce, LinkedIn
 * API-key integrations: Firecrawl, Apollo (always available, just toggle capability)
 */

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Mail, CheckCircle2, XCircle, ExternalLink, RefreshCw, Cloud, Linkedin, Search, Globe, Mic, Loader2, Save } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/contexts/AuthContext'

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://twilio-bridge-production-241b.up.railway.app'

interface IntegrationStatus {
  connected?: boolean
  available?: boolean
  email?: string
  connected_at?: string
  connected_via?: string
  provider?: string
  instance_url?: string
  account_id?: string
}

type AllStatuses = Record<string, IntegrationStatus>

function openOAuthLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function IntegrationsPanel() {
  const { org } = useOrg() as { org: { id: string } | null }
  const { user } = useAuth() as { user: { id: string } | null }
  const [statuses, setStatuses] = useState<AllStatuses>({})
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    if (!org?.id) return
    try {
      const res = await fetch(`${BRIDGE_URL}/integrations/status?org_id=${org.id}`)
      const data = await res.json()
      setStatuses(data)
    } catch (e) {
      console.error('Failed to fetch integrations', e)
    } finally {
      setLoading(false)
    }
  }, [org?.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  const startOAuth = async (provider: string, authPath: string) => {
    if (!org?.id) return
    setConnecting(provider)
    try {
      const params = new URLSearchParams({ org_id: org.id, source: 'dashboard' })
      if (user?.id) params.set('user_id', user.id)
      const res = await fetch(`${BRIDGE_URL}${authPath}?${params}`)
      const data = await res.json()
      if (data.url) {
        openOAuthLink(data.url)
        const start = Date.now()
        const poll = setInterval(async () => {
          await fetchAll()
          if (Date.now() - start > 120000) { clearInterval(poll); setConnecting(null) }
        }, 3000)
      } else {
        setConnecting(null)
      }
    } catch { setConnecting(null) }
  }

  const disconnect = async (provider: string) => {
    if (!org?.id) return
    if (!confirm(`Disconnect ${provider}?`)) return
    try {
      await fetch(`${BRIDGE_URL}/integrations/google/disconnect`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: org.id }),
      })
      await fetchAll()
    } catch {}
  }

  // Stop polling when connected
  useEffect(() => {
    if (connecting && statuses[connecting]?.connected) setConnecting(null)
  }, [connecting, statuses])

  const integrations = [
    {
      key: 'google', name: 'Google (Gmail + Calendar)', type: 'oauth' as const,
      icon: <Mail className="h-5 w-5 text-red-500" />,
      iconBg: 'bg-red-500/10 border-red-500/20',
      desc: 'Correo, calendario, resúmenes, drafts. Capabilities: inbox, calendar.',
      authPath: '/auth/google/start',
    },
    {
      key: 'salesforce', name: 'Salesforce CRM', type: 'oauth' as const,
      icon: <Cloud className="h-5 w-5 text-blue-400" />,
      iconBg: 'bg-blue-500/10 border-blue-500/20',
      desc: 'Cuentas, leads, contactos, sincronización. Capability: salesforce.',
      authPath: '/auth/salesforce/start',
    },
    {
      key: 'linkedin', name: 'LinkedIn', type: 'oauth' as const,
      icon: <Linkedin className="h-5 w-5 text-blue-600" />,
      iconBg: 'bg-blue-600/10 border-blue-600/20',
      desc: 'Perfiles, conexiones, mensajes, búsqueda. Capability: linkedin.',
      authPath: '/auth/linkedin/start',
    },
    {
      key: 'apollo', name: 'Apollo.io', type: 'apikey' as const,
      icon: <Search className="h-5 w-5 text-purple-500" />,
      iconBg: 'bg-purple-500/10 border-purple-500/20',
      desc: 'Búsqueda de prospectos, enriquecimiento, empresas. Capability: apollo.',
    },
    {
      key: 'gong', name: 'Gong', type: 'apikey_input' as const,
      icon: <Mic className="h-5 w-5 text-emerald-500" />,
      iconBg: 'bg-emerald-500/10 border-emerald-500/20',
      desc: 'Llamadas, transcripts, analytics de ventas. Capability: gong.',
      fields: [
        { name: 'api_key', label: 'Access Key', placeholder: 'Tu Gong Access Key' },
        { name: 'api_secret', label: 'Access Key Secret', placeholder: 'Tu Gong Access Key Secret', secret: true },
      ],
    },
    {
      key: 'firecrawl', name: 'Firecrawl', type: 'apikey' as const,
      icon: <Globe className="h-5 w-5 text-orange-500" />,
      iconBg: 'bg-orange-500/10 border-orange-500/20',
      desc: 'Web scraping, screenshots, búsqueda web. Siempre activo para todos los agentes.',
    },
  ]

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold mb-1">Integraciones</h2>
          <p className="text-sm text-muted-foreground">
            Conecta servicios y activa capabilities en tus agentes desde aquí o desde WhatsApp con Chief.
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {integrations.map(int => {
        const s = statuses[int.key] || {}
        const isConnected = s.connected === true
        const isAvailable = s.available === true

        return (
          <Card key={int.key}>
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-lg ${int.iconBg} border flex items-center justify-center shrink-0`}>
                  {int.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{int.name}</CardTitle>
                    {isConnected && <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">Connected</Badge>}
                    {!isConnected && int.type === 'apikey' && isAvailable && <Badge variant="outline" className="text-xs text-blue-500 border-blue-500/30">API Ready</Badge>}
                  </div>
                  <CardDescription className="text-xs mt-0.5">{int.desc}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : int.type === 'oauth' ? (
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      <span className="text-sm">{s.email || 'Connected'}</span>
                      {s.connected_via && <Badge variant="secondary" className="text-xs">via {s.connected_via}</Badge>}
                      <div className="flex-1" />
                      <Button variant="outline" size="sm" onClick={() => startOAuth(int.key, int.authPath!)} disabled={connecting === int.key}>
                        <RefreshCw className="h-3 w-3 mr-1" />Reconnect
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => disconnect(int.key)}>
                        <XCircle className="h-3 w-3 mr-1" />Disconnect
                      </Button>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground">Not connected</span>
                      <div className="flex-1" />
                      <Button size="sm" onClick={() => startOAuth(int.key, int.authPath!)} disabled={connecting === int.key}>
                        <ExternalLink className="h-3 w-3 mr-1" />
                        {connecting === int.key ? 'Connecting...' : 'Connect'}
                      </Button>
                    </>
                  )}
                </div>
              ) : int.type === 'apikey_input' ? (
                <ApiKeyForm provider={int.key} fields={int.fields || []} orgId={org?.id || ''} connected={isConnected} onSaved={fetchAll} />
              ) : (
                <div className="flex items-center gap-2">
                  {isAvailable ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      <span className="text-sm">API key configured. Activate via Chief: <code className="text-xs bg-muted px-1 rounded">"dale {int.key} a [agente]"</code></span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground">API key not configured in environment</span>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ── API Key Form (for Gong, etc.) ───────────────────────────────────────
function ApiKeyForm({ provider, fields, orgId, connected, onSaved }: {
  provider: string
  fields: Array<{ name: string; label: string; placeholder?: string; secret?: boolean }>
  orgId: string
  connected: boolean
  onSaved: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!orgId) return
    setSaving(true)
    try {
      const res = await fetch(`${BRIDGE_URL}/integrations/apikey/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          provider,
          api_key: values.api_key || values[fields[0]?.name] || '',
          api_secret: values.api_secret || values[fields[1]?.name] || '',
          label: provider,
        }),
      })
      const data = await res.json()
      if (data.success) {
        onSaved()
        setValues({})
      }
    } catch {} finally { setSaving(false) }
  }

  if (connected) {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
        <span className="text-sm">API key configured</span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => {
          if (!confirm('Remove API key?')) return
          await fetch(`${BRIDGE_URL}/integrations/google/disconnect`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ org_id: orgId }),
          })
          onSaved()
        }}>
          <XCircle className="h-3 w-3 mr-1" />Remove
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {fields.map(f => (
        <div key={f.name} className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
          <Input
            type={f.secret ? 'password' : 'text'}
            placeholder={f.placeholder}
            value={values[f.name] || ''}
            onChange={e => setValues(prev => ({ ...prev, [f.name]: e.target.value }))}
            className="h-8 text-xs"
          />
        </div>
      ))}
      <Button size="sm" onClick={handleSave} disabled={saving || !values[fields[0]?.name]}>
        {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
        Save API Key
      </Button>
    </div>
  )
}
