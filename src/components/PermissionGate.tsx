import type { ReactNode } from 'react'
import { useCanDo } from '@/hooks/usePermissions'
import type { OrgPermissions } from '@/types/permissions'

interface PermissionGateProps {
  permission: keyof OrgPermissions
  children: ReactNode
  fallback?: ReactNode
}

export function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const allowed = useCanDo(permission)
  return allowed ? <>{children}</> : <>{fallback}</>
}
