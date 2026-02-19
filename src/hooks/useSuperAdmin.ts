import { useAuth } from '@/contexts/AuthContext'

export function useSuperAdmin() {
  const { isSuperAdmin } = useAuth()
  return isSuperAdmin
}
