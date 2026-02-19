import { DEFAULT_ROLE_PERMISSIONS, type OrgRole, type OrgPermissions } from '@/types/permissions'

export interface OrgMembership {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  permissions: Partial<OrgPermissions>
  feature_flags: Record<string, boolean>
}

export function getEffectivePermissions(membership: OrgMembership): OrgPermissions {
  const defaults = DEFAULT_ROLE_PERMISSIONS[membership.role]
  return {
    ...defaults,
    ...membership.permissions,
  }
}

export function hasPermission(
  membership: OrgMembership,
  permission: keyof OrgPermissions
): boolean {
  const effective = getEffectivePermissions(membership)
  return effective[permission] === true
}
