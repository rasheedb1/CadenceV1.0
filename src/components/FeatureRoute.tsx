import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import type { FeatureFlagKey } from '@/types/feature-flags'

interface FeatureRouteProps {
  flag: FeatureFlagKey
  children: ReactNode
}

/**
 * Route guard — redirects to "/" if the feature flag is OFF.
 * Prevents direct URL access to disabled sections.
 */
export function FeatureRoute({ flag, children }: FeatureRouteProps) {
  const enabled = useFeatureFlag(flag)
  if (!enabled) return <Navigate to="/" replace />
  return <>{children}</>
}
