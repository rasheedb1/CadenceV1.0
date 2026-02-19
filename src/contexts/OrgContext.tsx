import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { OrgRole, OrgPermissions } from '@/types/permissions'
import type { OrgMembership } from '@/lib/permissions'

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  created_by: string
  created_at: string
  feature_flags: Record<string, boolean>
}

interface OrgContextType {
  org: Organization | null
  orgId: string | null
  membership: OrgMembership | null
  allOrgs: Organization[]
  isLoading: boolean
  switchOrg: (orgId: string) => Promise<void>
  createOrg: (name: string) => Promise<Organization>
  refreshOrgs: () => void
}

const OrgContext = createContext<OrgContextType | undefined>(undefined)

const ORG_STORAGE_KEY = 'laiky_current_org_id'

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth()
  const [org, setOrg] = useState<Organization | null>(null)
  const [membership, setMembership] = useState<OrgMembership | null>(null)
  const [allOrgs, setAllOrgs] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchOrgs = useCallback(async () => {
    if (!user) {
      setOrg(null)
      setMembership(null)
      setAllOrgs([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    // Fetch all orgs the user belongs to
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('id, org_id, user_id, role, permissions, feature_flags, organizations(*)')
      .eq('user_id', user.id)

    if (!memberships || memberships.length === 0) {
      setAllOrgs([])
      setOrg(null)
      setMembership(null)
      setIsLoading(false)
      return
    }

    const orgs = memberships
      .map(m => m.organizations as unknown as Organization)
      .filter(Boolean)

    setAllOrgs(orgs)

    // Determine current org: profile.current_org_id > localStorage > first org
    const currentOrgId =
      profile?.current_org_id ||
      localStorage.getItem(ORG_STORAGE_KEY) ||
      orgs[0]?.id

    const currentMembership = memberships.find(m => m.org_id === currentOrgId)
      || memberships[0]

    if (currentMembership) {
      const currentOrg = orgs.find(o => o.id === currentMembership.org_id) || null
      setOrg(currentOrg)
      setMembership({
        id: currentMembership.id,
        org_id: currentMembership.org_id,
        user_id: currentMembership.user_id,
        role: currentMembership.role as OrgRole,
        permissions: (currentMembership.permissions || {}) as Partial<OrgPermissions>,
        feature_flags: (currentMembership.feature_flags as Record<string, boolean>) || {},
      })

      // Persist to localStorage for fast reload
      if (currentOrg) {
        localStorage.setItem(ORG_STORAGE_KEY, currentOrg.id)
      }

      // Sync to profile if different
      if (currentOrg && profile?.current_org_id !== currentOrg.id) {
        supabase
          .from('profiles')
          .update({ current_org_id: currentOrg.id })
          .eq('user_id', user.id)
          .then(() => {})
      }
    }

    setIsLoading(false)
  }, [user?.id, profile?.current_org_id])

  useEffect(() => {
    fetchOrgs()
  }, [fetchOrgs])

  const switchOrg = useCallback(async (newOrgId: string) => {
    if (!user) return

    const targetOrg = allOrgs.find(o => o.id === newOrgId)
    if (!targetOrg) return

    // Fetch membership for the target org
    const { data: mem } = await supabase
      .from('organization_members')
      .select('id, org_id, user_id, role, permissions, feature_flags')
      .eq('org_id', newOrgId)
      .eq('user_id', user.id)
      .single()

    if (!mem) return

    setOrg(targetOrg)
    setMembership({
      id: mem.id,
      org_id: mem.org_id,
      user_id: mem.user_id,
      role: mem.role as OrgRole,
      permissions: (mem.permissions || {}) as Partial<OrgPermissions>,
      feature_flags: (mem.feature_flags as Record<string, boolean>) || {},
    })

    localStorage.setItem(ORG_STORAGE_KEY, newOrgId)

    await supabase
      .from('profiles')
      .update({ current_org_id: newOrgId })
      .eq('user_id', user.id)
  }, [user?.id, allOrgs])

  const createOrg = useCallback(async (name: string): Promise<Organization> => {
    if (!user) throw new Error('Not authenticated')

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + '-' + Math.random().toString(36).substring(2, 8)

    const { data: newOrg, error: orgError } = await supabase
      .from('organizations')
      .insert({ name, slug, created_by: user.id })
      .select()
      .single()

    if (orgError || !newOrg) throw orgError || new Error('Failed to create organization')

    // Add creator as admin
    await supabase
      .from('organization_members')
      .insert({
        org_id: newOrg.id,
        user_id: user.id,
        role: 'admin',
      })

    // Set as current org
    await supabase
      .from('profiles')
      .update({ current_org_id: newOrg.id })
      .eq('user_id', user.id)

    localStorage.setItem(ORG_STORAGE_KEY, newOrg.id)

    // Refresh state
    await fetchOrgs()

    return newOrg as Organization
  }, [user?.id, fetchOrgs])

  const refreshOrgs = useCallback(() => {
    fetchOrgs()
  }, [fetchOrgs])

  return (
    <OrgContext.Provider value={{
      org,
      orgId: org?.id || null,
      membership,
      allOrgs,
      isLoading,
      switchOrg,
      createOrg,
      refreshOrgs,
    }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const context = useContext(OrgContext)
  if (context === undefined) {
    throw new Error('useOrg must be used within an OrgProvider')
  }
  return context
}
