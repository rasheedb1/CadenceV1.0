import { createContext, useContext, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { useQuery } from '@tanstack/react-query'
import type { AEIntegration } from '@/types/account-executive'
import { toast } from 'sonner'

// ── Context type ─────────────────────────────────────────────
interface AccountExecutiveContextType {
  // Integrations
  integrations: AEIntegration[]
  isLoadingIntegrations: boolean
  // Sync actions
  syncGong: (accountId?: string) => Promise<void>
  syncCalendar: () => Promise<void>
  debugCalendarSync: () => Promise<Record<string, unknown>>
  connectGoogleCalendar: () => Promise<void>
  analyzeEmails: (accountId: string, domain: string) => Promise<void>
  isSyncingGong: boolean
  isSyncingCalendar: boolean
  isAnalyzingEmails: boolean
  // Integration management
  saveGongCredentials: (accessKey: string, secretKey: string) => Promise<void>
  disconnectIntegration: (provider: 'gong' | 'google_calendar') => Promise<void>
}

const AccountExecutiveContext = createContext<AccountExecutiveContextType | undefined>(undefined)

// ── Provider ─────────────────────────────────────────────────
export function AccountExecutiveProvider({ children }: { children: ReactNode }) {
  const { orgId } = useOrg()
  const { user, session } = useAuth()
  const qc = useQueryClient()
  const [isSyncingGong, setIsSyncingGong] = useState(false)
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false)
  const [isAnalyzingEmails, setIsAnalyzingEmails] = useState(false)

  // ── Load integrations ──────────────────────────────────────
  const { data: integrations = [], isLoading: isLoadingIntegrations } = useQuery({
    queryKey: ['ae-integrations', orgId, user?.id],
    queryFn: async () => {
      if (!orgId || !user) return []
      const { data, error } = await supabase
        .from('ae_integrations')
        .select('id, org_id, user_id, provider, token_expires_at, config, connected_at')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
      if (error) throw error
      return (data || []) as AEIntegration[]
    },
    enabled: !!orgId && !!user,
  })

  // ── Helper: call edge function ──────────────────────────────
  const callEdge = async (name: string, payload: Record<string, unknown>) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(payload),
    })
    const json = await resp.json()
    if (!resp.ok) throw new Error(json.error || `${name} failed`)
    return json
  }

  // ── Sync Gong ─────────────────────────────────────────────
  const syncGong = async (accountId?: string) => {
    if (!session) return
    setIsSyncingGong(true)
    try {
      const result = await callEdge('ae-gong-sync', { ae_account_id: accountId || null })
      toast.success(`Synced ${result.synced || 0} calls, created ${result.reminders_created || 0} reminders`)
      qc.invalidateQueries({ queryKey: ['ae-activities'] })
      qc.invalidateQueries({ queryKey: ['ae-activities-recent'] })
      qc.invalidateQueries({ queryKey: ['ae-reminders'] })
    } catch (e) {
      toast.error('Gong sync failed: ' + (e instanceof Error ? e.message : 'Unknown error'))
    } finally {
      setIsSyncingGong(false)
    }
  }

  // ── Sync Google Calendar ───────────────────────────────────
  const syncCalendar = async () => {
    if (!session) return
    setIsSyncingCalendar(true)
    try {
      const result = await callEdge('ae-calendar-sync', {})
      toast.success(`Synced ${result.synced || 0} calendar events`)
      qc.invalidateQueries({ queryKey: ['ae-activities'] })
      qc.invalidateQueries({ queryKey: ['ae-activities-recent'] })
    } catch (e) {
      toast.error('Calendar sync failed: ' + (e instanceof Error ? e.message : 'Unknown error'))
    } finally {
      setIsSyncingCalendar(false)
    }
  }

  // ── Connect Google Calendar (OAuth) ──────────────────────
  const connectGoogleCalendar = async () => {
    if (!session) return
    try {
      const result = await callEdge('ae-google-oauth', {})
      if (result.url) {
        window.location.href = result.url
      } else {
        toast.error('Could not generate Google auth URL')
      }
    } catch (e) {
      toast.error('Failed to start Google Calendar connection: ' + (e instanceof Error ? e.message : 'Unknown error'))
    }
  }

  const debugCalendarSync = async (): Promise<Record<string, unknown>> => {
    if (!session) return {}
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ae-calendar-sync?debug=true`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({}),
    })
    return await resp.json()
  }

  // ── Analyze Emails ─────────────────────────────────────────
  const analyzeEmails = async (accountId: string, domain: string) => {
    if (!session) return
    setIsAnalyzingEmails(true)
    try {
      const result = await callEdge('ae-email-analysis', { ae_account_id: accountId, domain })
      toast.success(`Created ${result.reminders_created || 0} follow-up reminders`)
      qc.invalidateQueries({ queryKey: ['ae-reminders'] })
    } catch (e) {
      toast.error('Email analysis failed: ' + (e instanceof Error ? e.message : 'Unknown error'))
    } finally {
      setIsAnalyzingEmails(false)
    }
  }

  // ── Save Gong Credentials ──────────────────────────────────
  const saveGongCredentials = async (accessKey: string, secretKey: string) => {
    if (!orgId || !user) throw new Error('No org/user')
    const { error } = await supabase
      .from('ae_integrations')
      .upsert({
        org_id: orgId,
        user_id: user.id,
        provider: 'gong',
        access_token: accessKey,
        refresh_token: secretKey,  // reuse refresh_token field for gong secret
        config: {},
        connected_at: new Date().toISOString(),
      }, { onConflict: 'org_id,user_id,provider' })
    if (error) throw error
    qc.invalidateQueries({ queryKey: ['ae-integrations'] })
    toast.success('Gong connected')
  }

  // ── Disconnect Integration ─────────────────────────────────
  const disconnectIntegration = async (provider: 'gong' | 'google_calendar') => {
    if (!orgId || !user) return
    const { error } = await supabase
      .from('ae_integrations')
      .delete()
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .eq('provider', provider)
    if (error) throw error
    qc.invalidateQueries({ queryKey: ['ae-integrations'] })
    toast.success(`${provider === 'gong' ? 'Gong' : 'Google Calendar'} disconnected`)
  }


  return (
    <AccountExecutiveContext.Provider value={{
      integrations,
      isLoadingIntegrations,
      syncGong,
      syncCalendar,
      debugCalendarSync,
      connectGoogleCalendar,
      analyzeEmails,
      isSyncingGong,
      isSyncingCalendar,
      isAnalyzingEmails,
      saveGongCredentials,
      disconnectIntegration,
    }}>
      {children}
    </AccountExecutiveContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────
export function useAccountExecutive() {
  const ctx = useContext(AccountExecutiveContext)
  if (!ctx) throw new Error('useAccountExecutive must be used within AccountExecutiveProvider')
  return ctx
}
