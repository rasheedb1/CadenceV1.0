import { useMemo } from 'react'
import { useOrg } from '@/contexts/OrgContext'
import { getEffectivePermissions } from '@/lib/permissions'
import { DEFAULT_ROLE_PERMISSIONS, type OrgRole, type OrgPermissions } from '@/types/permissions'

export function usePermissions(): OrgPermissions & { role: OrgRole } {
  const { membership } = useOrg()

  return useMemo(() => {
    if (!membership) {
      return { ...DEFAULT_ROLE_PERMISSIONS.viewer, role: 'viewer' as const }
    }
    return {
      ...getEffectivePermissions(membership),
      role: membership.role,
    }
  }, [membership])
}

export function useCanDo(permission: keyof OrgPermissions): boolean {
  const perms = usePermissions()
  return perms[permission] === true
}
