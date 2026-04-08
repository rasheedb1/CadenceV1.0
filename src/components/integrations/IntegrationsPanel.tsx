/**
 * Integrations Panel — shared connection management for agents.
 * Currently supports Google (Gmail). Reads from agent_integrations.
 * Connect button opens the bridge OAuth flow in a new tab.
 */

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Mail, CheckCircle2, XCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/contexts/AuthContext'

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://twilio-bridge-production-241b.up.railway.app'

interface GoogleStatus {
  connected: boolean
  email?: string
  connected_at?: string
  connected_via?: string
  expires_at?: string
  last_used_at?: string
  status?: string
}

export function IntegrationsPanel() {
  const { org } = useOrg() as { org: { id: string } | null }
  const { user } = useAuth() as { user: { id: string } | null }
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)

  const fetchStatus = useCallback(async () => {
    if (!org?.id) return
    try {
      const res = await fetch(`${BRIDGE_URL}/integrations/google/status?org_id=${org.id}`)
      const data = await res.json()
      setGoogleStatus(data)
    } catch (e) {
      console.error('Failed to fetch integration status', e)
      setGoogleStatus({ connected: false })
    } finally {
      setLoading(false)
    }
  }, [org?.id])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleConnect = () => {
    if (!org?.id) return
    setConnecting(true)
    const params = new URLSearchParams({
      org_id: org.id,
      source: 'dashboard',
      ...(user?.id ? { user_id: user.id } : {}),
    })
    const startUrl = `${BRIDGE_URL}/auth/google/start?${params}`
    // Open the bridge start URL directly in a new tab — it returns the Google URL as JSON
    // or redirects when Accept: text/html. We fetch JSON and open Google in a new tab.
    fetch(startUrl)
      .then(r => r.json())
      .then(data => {
        if (data.url) {
          window.open(data.url, '_blank', 'noopener,noreferrer')
          // Poll status every 3s for up to 2 minutes
          const startedAt = Date.now()
          const poll = setInterval(() => {
            fetchStatus()
            if (Date.now() - startedAt > 120_000) {
              clearInterval(poll)
              setConnecting(false)
            }
          }, 3000)
          // Also stop polling once connected
          const checkConnected = setInterval(() => {
            if (googleStatus?.connected) {
              clearInterval(poll)
              clearInterval(checkConnected)
              setConnecting(false)
            }
          }, 1000)
        } else {
          setConnecting(false)
        }
      })
      .catch(() => setConnecting(false))
  }

  const handleDisconnect = async () => {
    if (!org?.id) return
    if (!confirm('¿Seguro que quieres desconectar Gmail? Los agentes dejarán de tener acceso.')) return
    try {
      await fetch(`${BRIDGE_URL}/integrations/google/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: org.id }),
      })
      await fetchStatus()
    } catch (e) {
      console.error('Failed to disconnect', e)
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">Integraciones</h2>
        <p className="text-sm text-muted-foreground">
          Conecta servicios externos para que tus agentes (Paula y otros) tengan acceso a tus datos personales y de trabajo.
          Las integraciones son compartidas: puedes conectarlas desde aquí o desde WhatsApp con Chief.
        </p>
      </div>

      {/* Google / Gmail */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Mail className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <CardTitle className="text-base">Google / Gmail</CardTitle>
                <CardDescription className="text-xs">
                  Paula usa este acceso para triage de correos, resúmenes y drafts de respuesta. Lectura + draft (no envío sin aprobación).
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchStatus} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="text-sm text-muted-foreground">Cargando…</div>
          ) : googleStatus?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Conectado</span>
                <Badge variant="outline" className="text-xs">{googleStatus.email}</Badge>
                {googleStatus.connected_via && (
                  <Badge variant="secondary" className="text-xs">vía {googleStatus.connected_via}</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Conectado {googleStatus.connected_at ? new Date(googleStatus.connected_at).toLocaleString() : ''}
                {googleStatus.last_used_at && ` · Último uso: ${new Date(googleStatus.last_used_at).toLocaleString()}`}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleConnect}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Reconectar
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDisconnect}>
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />Desconectar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">No conectado</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Al conectar, tus tokens se guardan cifrados en la BD. Paula usará estos permisos para leer/archivar correos y crear drafts.
                Nunca enviará nada sin tu aprobación explícita.
              </p>
              <Button onClick={handleConnect} disabled={connecting || !org?.id}>
                <ExternalLink className="h-4 w-4 mr-2" />
                {connecting ? 'Conectando…' : 'Conectar Gmail'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
