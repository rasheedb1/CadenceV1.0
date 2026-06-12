import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { useOrg } from '@/contexts/OrgContext'
import type { FeatureFlagKey } from '@/types/feature-flags'

interface FeatureRouteProps {
  flag: FeatureFlagKey
  children: ReactNode
}

/**
 * Route guard — redirects to "/" if the feature flag is OFF.
 * Waits for the org context to finish loading before checking the flag, otherwise the
 * default (often false for new sections) wins on first render and redirects users away
 * from a section their org actually has enabled.
 */
export function FeatureRoute({ flag, children }: FeatureRouteProps) {
  const { isLoading } = useOrg()
  const enabled = useFeatureFlag(flag)
  if (isLoading) return null
  if (!enabled) return <Navigate to="/" replace />
  return <>{children}</>
}
